import { getAuthedUserClient } from '../_shared/auth.ts'
import { corsHeaders, json } from '../_shared/cors.ts'
import { getLlmProvider } from '../_shared/llm/provider.ts'
import type { ChatMessage, LlmProvider } from '../_shared/llm/types.ts'
import { TOOL_DEFS } from '../_shared/tools/catalog.ts'
import { executeTool } from '../_shared/tools/executor.ts'

const MAX_TOOL_ITERATIONS = 6
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const MAX_REQUESTS_PER_USER_PER_WINDOW = 20
const requestTimesByUser = new Map<string, number[]>()

function isAuthError(error: unknown): boolean {
  return error instanceof Error && (error.message === 'Missing authorization' || error.message === 'Unauthorized')
}

function sanitizeErrorMessage(error: unknown): string | null {
  if (!(error instanceof Error) || !error.message.trim()) return null
  // Never echo secrets if a provider leak somehow includes them.
  return error.message
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, '[redacted]')
    .replace(/sk-[0-9A-Za-z_-]{10,}/g, '[redacted]')
    .slice(0, 300)
}

function logChatRequest(input: {
  userId: string | null
  toolNames: string[]
  latencyMs: number
  provider: string | null
  errorCode: string | null
  stage: string | null
  errorMessage: string | null
}) {
  console.log(JSON.stringify({
    event: 'fynn_chat_request',
    user_id: input.userId,
    tool_names: input.toolNames,
    latency_ms: input.latencyMs,
    provider: input.provider,
    error_code: input.errorCode,
    stage: input.stage,
    error_message: input.errorMessage,
  }))
}

function isRateLimited(userId: string, now = Date.now()): boolean {
  const requestTimes = (requestTimesByUser.get(userId) ?? [])
    .filter((requestTime) => requestTime > now - RATE_LIMIT_WINDOW_MS)

  if (requestTimes.length >= MAX_REQUESTS_PER_USER_PER_WINDOW) {
    requestTimesByUser.set(userId, requestTimes)
    return true
  }

  requestTimes.push(now)
  requestTimesByUser.set(userId, requestTimes)
  return false
}

type ToolResult = { ok: true; result: unknown } | { ok: false; error: string }

type ProposalResult = {
  proposal_id: string
  summary: string
  preview: unknown
}

type ChatPersistence = {
  createChat: (userClient: any, userId: string, title: string) => Promise<string>
  requireChat: (userClient: any, chatId: string) => Promise<void>
  listMessages: (userClient: any, chatId: string) => Promise<ChatMessage[]>
  saveMessage: (userClient: any, input: {
    chatId: string
    userId: string
    role: 'user' | 'assistant'
    content: string
    proposalMetadata?: unknown
  }) => Promise<string>
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
  persistence?: ChatPersistence
}

const systemPrompt = `You are Fynn, a helpful personal finance assistant. Use the available tools to answer questions about this user's money data. Never invent balances, transactions, subscriptions, or other financial data. Only use the listed tools, and clearly say when the data is unavailable.`

const persistence: ChatPersistence = {
  async createChat(userClient, userId, title) {
    const { data, error } = await userClient
      .from('fynn_chats')
      .insert({ user_id: userId, title })
      .select('id')
      .single()
    if (error || !data?.id) throw new Error(error?.message || 'Unable to create chat')
    return data.id
  },
  async requireChat(userClient, chatId) {
    const { data, error } = await userClient
      .from('fynn_chats')
      .select('id')
      .eq('id', chatId)
      .single()
    if (error || !data) throw new Error(error?.message || 'Chat not found')
  },
  async listMessages(userClient, chatId) {
    const { data, error } = await userClient
      .from('fynn_messages')
      .select('role, content')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true })
    if (error) throw new Error(error.message)
    return (data || []).flatMap((message: { role: unknown; content: unknown }): ChatMessage[] => (
      (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string'
        ? [{ role: message.role, content: message.content }]
        : []
    ))
  },
  async saveMessage(userClient, { chatId, userId, role, content, proposalMetadata }) {
    const { data, error } = await userClient.from('fynn_messages').insert({
      chat_id: chatId,
      user_id: userId,
      role,
      content,
      ...(proposalMetadata === undefined ? {} : { proposal_metadata: proposalMetadata }),
    }).select('id').single()
    if (error || !data?.id) throw new Error(error?.message || 'Unable to save message')
    return data.id
  },
}

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
    persistence,
  }
) {
  const persistenceLayer = dependencies.persistence ?? persistence

  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    const startedAt = Date.now()
    let userId: string | null = null
    let providerName: string | null = null
    let stage: string | null = 'auth'
    let errorMessage: string | null = null
    const toolNames = new Set<string>()
    let errorCode: string | null = null

    try {
      const { user, userClient } = await dependencies.getAuthedUserClient(req)
      userId = user.id
      stage = 'validate'
      const body = await req.json().catch(() => ({}))
      if (typeof body.message !== 'string' || !body.message.trim()) {
        errorCode = 'VALIDATION_ERROR'
        errorMessage = 'Message is required'
        return json({ error: 'Message is required' }, 400)
      }
      if (isRateLimited(user.id)) {
        errorCode = 'RATE_LIMITED'
        errorMessage = 'Too many Fynn chat requests. Try again later.'
        return json({ error: 'Too many Fynn chat requests. Try again later.' }, 429)
      }
      stage = 'persist'
      const requestedChatId = typeof body.chat_id === 'string' && body.chat_id.trim()
        ? body.chat_id.trim()
        : null
      const chatId = requestedChatId
        ? (await persistenceLayer.requireChat(userClient, requestedChatId), requestedChatId)
        : await persistenceLayer.createChat(userClient, user.id, String(body.message || '').trim())
      const history = requestedChatId
        ? await persistenceLayer.listMessages(userClient, chatId)
        : []
      const messages = parseMessages(history, body.message)
      if (!messages) {
        errorCode = 'VALIDATION_ERROR'
        errorMessage = 'Message is required'
        return json({ error: 'Message is required' }, 400)
      }
      const userMessageId = await persistenceLayer.saveMessage(userClient, {
        chatId,
        userId: user.id,
        role: 'user',
        content: messages.at(-1)!.content,
      })

      stage = 'provider'
      providerName = dependencies.getLlmProvider === getLlmProvider
        ? (Deno.env.get('LLM_PROVIDER') ?? 'gemini').toLowerCase()
        : 'injected'
      const provider = dependencies.getLlmProvider()
      stage = 'llm'
      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
        const completion = await provider.complete({ messages, tools: TOOL_DEFS })
        if (completion.toolCalls.length === 0) {
          if (!completion.assistantText?.trim()) {
            throw new Error('Unable to complete chat response')
          }
          stage = 'persist_assistant'
          const messageId = await persistenceLayer.saveMessage(userClient, {
            chatId,
            userId: user.id,
            role: 'assistant',
            content: completion.assistantText,
          })
          return json({
            type: 'message',
            text: completion.assistantText,
            chatId,
            userMessageId,
            messageId,
          })
        }

        stage = 'tools'
        for (const toolCall of completion.toolCalls) {
          toolNames.add(toolCall.name)
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
              const text = 'Please confirm this change.'
              const messageId = await persistenceLayer.saveMessage(userClient, {
                chatId,
                userId: user.id,
                role: 'assistant',
                content: text,
                proposalMetadata: {
                  id: proposal.proposal_id,
                  summary: proposal.summary,
                  preview: proposal.preview,
                  status: 'pending',
                },
              })
              return json({
                type: 'proposal',
                proposalId: proposal.proposal_id,
                summary: proposal.summary,
                preview: proposal.preview,
                text,
                chatId,
                userMessageId,
                messageId,
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
      const unauthorized = isAuthError(error)
      errorCode = unauthorized ? 'AUTH_FAILED' : 'REQUEST_FAILED'
      errorMessage = sanitizeErrorMessage(error) ?? 'Fynn chat failed'
      return json(
        { error: errorMessage },
        unauthorized ? 401 : 400
      )
    } finally {
      logChatRequest({
        userId,
        toolNames: [...toolNames],
        latencyMs: Date.now() - startedAt,
        provider: providerName,
        errorCode,
        stage,
        errorMessage,
      })
    }
  }
}

if (import.meta.main) {
  Deno.serve(createFynnChatHandler())
}
