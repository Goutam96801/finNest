import { getAuthedUserClient } from '../_shared/auth.ts'
import { corsHeaders, json } from '../_shared/cors.ts'
import { TOOL_DEFINITIONS, buildSystemPrompt, executeReadTool } from '../_shared/ai-tools.ts'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = Deno.env.get('OPENROUTER_MODEL') || 'openrouter/free'
const MAX_TOOL_ROUNDS = 6
const HISTORY_LIMIT = 20 // prior messages to include as context
const PROPOSAL_TTL_MS = 5 * 60 * 1000

type ChatMsg = { role: string; content: string | null; tool_calls?: unknown; tool_call_id?: string }

function statusForTool(name: string): string {
  switch (name) {
    case 'get_transactions':
      return 'Looking up your transactions…'
    case 'get_summary':
      return 'Crunching the numbers…'
    case 'get_accounts':
      return 'Checking your accounts…'
    case 'get_subscriptions':
      return 'Checking your subscriptions…'
    case 'get_categories':
      return 'Checking your categories…'
    case 'render_chart':
      return 'Building your chart…'
    default:
      return 'Working on it…'
  }
}

// Parses an OpenRouter/OpenAI-compatible SSE stream, yielding each decoded JSON chunk.
async function* parseSse(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') return
      try {
        yield JSON.parse(data)
      } catch {
        // ignore malformed keep-alive fragments
      }
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!openrouterKey) return json({ error: 'Server not configured' }, 500)

  let ctx: Awaited<ReturnType<typeof getAuthedUserClient>>
  try {
    ctx = await getAuthedUserClient(req)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unauthorized' }, 401)
  }
  const { user, userClient } = ctx

  const body = await req.json().catch(() => ({}))
  const userMessage = String(body.message ?? '').trim()
  if (!userMessage) return json({ error: 'message is required' }, 400)

  const { data: consume, error: consumeError } = await userClient.rpc('consume_fynn_message')
  if (consumeError) return json({ error: consumeError.message }, 500)
  const consumeRaw = typeof consume === 'string' ? JSON.parse(consume) : (consume ?? {})
  const consumeResult = consumeRaw as { ok?: boolean; code?: string; used?: number; limit?: number; resets_at?: string }
  if (!consumeResult.ok) {
    if (consumeResult.code === 'DAILY_LIMIT') {
      return json({
        error: 'daily_limit',
        code: 'DAILY_LIMIT',
        used: consumeResult.used ?? 20,
        limit: consumeResult.limit ?? 20,
        resetsAt: consumeResult.resets_at ?? null,
      }, 429)
    }
    return json({ error: 'subscription_required', code: 'SUBSCRIPTION_REQUIRED' }, 402)
  }

  const { data: profile } = await userClient.from('profiles').select('currency, timezone').eq('id', user.id).single()

  // Get or create the chat.
  let chatId = body.chat_id as string | undefined
  if (!chatId) {
    const { data, error } = await userClient
      .from('fynn_chats')
      .insert({ user_id: user.id, title: userMessage.slice(0, 60) })
      .select('id')
      .single()
    if (error) return json({ error: error.message }, 500)
    chatId = data.id
  }

  // Prior turns for context.
  const { data: historyRows } = await userClient
    .from('fynn_messages')
    .select('role, content')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT)
  const history = (historyRows ?? []).reverse()

  const { data: userMsgRow, error: userMsgError } = await userClient
    .from('fynn_messages')
    .insert({ chat_id: chatId, user_id: user.id, role: 'user', content: userMessage })
    .select('id')
    .single()
  if (userMsgError) return json({ error: userMsgError.message }, 500)
  const userMessageId = userMsgRow.id

  const today = new Date().toISOString().slice(0, 10)
  const systemPrompt = buildSystemPrompt({
    currency: profile?.currency || 'INR',
    timezone: profile?.timezone || 'Asia/Kolkata',
    today,
  })

  const messages: ChatMsg[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: userMessage },
  ]

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      let finalText = ''
      let proposalMetadata: Record<string, unknown> | null = null
      let chartMetadata: Record<string, unknown> | null = null
      let stopped = false

      try {
        for (let round = 0; round < MAX_TOOL_ROUNDS && !stopped; round++) {
          const resp = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${openrouterKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://finnest.app',
              'X-Title': 'finNest AI Chat',
            },
            body: JSON.stringify({
              model: MODEL,
              messages,
              tools: TOOL_DEFINITIONS,
              tool_choice: 'auto',
              stream: true,
              reasoning: { enabled: true },
            }),
          })

          if (!resp.ok || !resp.body) {
            const errText = await resp.text().catch(() => '')
            send({ type: 'error', message: `AI provider error (${resp.status}): ${errText.slice(0, 300)}` })
            stopped = true
            break
          }

          let roundContent = ''
          const toolCallAcc = new Map<number, { id: string; name: string; args: string }>()
          let finishReason: string | null = null

          for await (const chunk of parseSse(resp.body)) {
            const choice = chunk.choices?.[0]
            if (!choice) continue
            const delta = choice.delta ?? {}

            if (delta.reasoning) send({ type: 'thinking', text: delta.reasoning })
            if (delta.content) {
              roundContent += delta.content
              send({ type: 'token', text: delta.content })
            }
            if (Array.isArray(delta.tool_calls)) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0
                const existing = toolCallAcc.get(idx) ?? { id: '', name: '', args: '' }
                if (tc.id) existing.id = tc.id
                if (tc.function?.name) existing.name = tc.function.name
                if (tc.function?.arguments) existing.args += tc.function.arguments
                toolCallAcc.set(idx, existing)
              }
            }
            if (choice.finish_reason) finishReason = choice.finish_reason
          }

          finalText += roundContent

          if (finishReason !== 'tool_calls' || toolCallAcc.size === 0) {
            stopped = true
            break
          }

          const toolCalls = Array.from(toolCallAcc.values())
          messages.push({
            role: 'assistant',
            content: roundContent || null,
            tool_calls: toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function',
              function: { name: tc.name, arguments: tc.args },
            })),
          })

          for (const tc of toolCalls) {
            let args: Record<string, unknown> = {}
            try {
              args = JSON.parse(tc.args || '{}')
            } catch {
              /* leave empty */
            }

            if (tc.name === 'propose_transaction_write') {
              const { data: proposalRow, error: proposalError } = await userClient
                .from('fynn_proposals')
                .insert({
                  user_id: user.id,
                  tool_name: tc.name,
                  payload: args,
                  summary: String(args.summary ?? 'Confirm this change?'),
                  status: 'pending',
                  expires_at: new Date(Date.now() + PROPOSAL_TTL_MS).toISOString(),
                })
                .select('id, summary')
                .single()

              if (proposalError) {
                send({ type: 'error', message: proposalError.message })
              } else {
                proposalMetadata = {
                  id: proposalRow.id,
                  summary: proposalRow.summary,
                  preview: args,
                  status: 'pending',
                }
                send({
                  type: 'proposal',
                  proposalId: proposalRow.id,
                  summary: proposalRow.summary,
                  preview: args,
                })
              }
              messages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: JSON.stringify({ status: 'awaiting_user_confirmation' }),
              })
              stopped = true // wait for the user to confirm/reject before continuing
              continue
            }

            if (tc.name === 'render_chart') {
              chartMetadata = args
              send({ type: 'chart', chart: args })
              messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ status: 'rendered' }) })
              continue
            }

            send({ type: 'thinking', text: statusForTool(tc.name) })
            try {
              const result = await executeReadTool(userClient, tc.name, args)
              messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) })
            } catch (e) {
              messages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: JSON.stringify({ error: e instanceof Error ? e.message : 'Tool failed' }),
              })
            }
          }
        }
      } catch (e) {
        send({ type: 'error', message: e instanceof Error ? e.message : 'Unexpected error' })
      }

      const { data: assistantMsgRow } = await userClient
        .from('fynn_messages')
        .insert({
          chat_id: chatId,
          user_id: user.id,
          role: 'assistant',
          content: finalText,
          proposal_metadata: proposalMetadata,
          chart_metadata: chartMetadata,
        })
        .select('id')
        .single()

      send({ type: 'done', chatId, userMessageId, messageId: assistantMsgRow?.id ?? null })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
})
