import { getAuthedUserClient } from '../_shared/auth.ts'
import { corsHeaders, json } from '../_shared/cors.ts'
import { getLlmProvider } from '../_shared/llm/provider.ts'
import type { ChatMessage, LlmProvider } from '../_shared/llm/types.ts'
import { TOOL_DEFS } from '../_shared/tools/catalog.ts'
import { executeTool } from '../_shared/tools/executor.ts'

const MAX_TOOL_ITERATIONS = 6

type ToolResult = { ok: true; result: unknown } | { ok: false; error: string }

type ProposalResult = {
  proposal_id: string
  summary: string
  preview: unknown
}

type FynnChatDependencies = {
  getAuthedUserClient: (req: Request) => Promise<{
    user: { id: string }
    userClient: any
  }>
  getLlmProvider: () => LlmProvider
  executeTool: (input: {
    name: string
    args: Record<string, unknown>
    userId: string
    userClient: any
  }) => Promise<ToolResult>
}

const systemPrompt = `You are Fynn, a helpful personal finance assistant. Use the available tools to answer questions about this user's money data. Never invent balances, transactions, subscriptions, or other financial data. Only use the listed tools, and clearly say when the data is unavailable.`

function proposalResult(value: unknown): ProposalResult | null {
  if (!value || typeof value !== 'object') return null
  const result = value as Record<string, unknown>
  return typeof result.proposal_id === 'string'
    && typeof result.summary === 'string'
    && 'preview' in result
    ? result as ProposalResult
    : null
}

function parseMessages(
  history: unknown,
  message: unknown
): ChatMessage[] | null {
  if (typeof message !== 'string' || !message.trim()) return null

  const priorMessages = Array.isArray(history)
    ? history.flatMap((item): ChatMessage[] => {
        if (
          !item ||
          typeof item !== 'object' ||
          !('role' in item) ||
          !('content' in item) ||
          (item.role !== 'user' && item.role !== 'assistant') ||
          typeof item.content !== 'string'
        ) {
          return []
        }

        return [{ role: item.role, content: item.content }]
      })
    : []

  return [
    { role: 'system', content: systemPrompt },
    ...priorMessages,
    { role: 'user', content: message.trim() },
  ]
}

export function createFynnChatHandler(
  dependencies: FynnChatDependencies = {
    getAuthedUserClient,
    getLlmProvider,
    executeTool,
  }
) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    try {
      const { user, userClient } = await dependencies.getAuthedUserClient(req)
      const body = await req.json().catch(() => ({}))
      const messages = parseMessages(body.history, body.message)
      if (!messages) return json({ error: 'Message is required' }, 400)

      const provider = dependencies.getLlmProvider()
      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
        const completion = await provider.complete({ messages, tools: TOOL_DEFS })
        if (completion.toolCalls.length === 0) {
          if (!completion.assistantText?.trim()) {
            throw new Error('Unable to complete chat response')
          }
          return json({ type: 'message', text: completion.assistantText })
        }

        for (const toolCall of completion.toolCalls) {
          messages.push({
            role: 'assistant',
            content: JSON.stringify(toolCall.arguments),
            toolCallId: toolCall.id,
            name: toolCall.name,
          })

          const result = await dependencies.executeTool({
            name: toolCall.name,
            args: toolCall.arguments,
            userId: user.id,
            userClient,
          })
          if (result.ok) {
            const proposal = proposalResult(result.result)
            if (proposal) {
              return json({
                type: 'proposal',
                proposalId: proposal.proposal_id,
                summary: proposal.summary,
                preview: proposal.preview,
              })
            }
          }
          messages.push({
            role: 'tool',
            content: JSON.stringify(result),
            toolCallId: toolCall.id,
            name: toolCall.name,
          })
        }
      }

      throw new Error('Unable to complete chat response')
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : 'Fynn chat failed' },
        400
      )
    }
  }
}

if (import.meta.main) {
  Deno.serve(createFynnChatHandler())
}
