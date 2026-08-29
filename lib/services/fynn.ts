import { fetch as expoFetch } from 'expo/fetch'
import { supabase } from '@/lib/supabase'
import { ResponseType } from '@/types'

export type FynnChartSpec = {
  chart_type: 'line' | 'bar' | 'pie'
  title: string
  labels: string[]
  series: { name?: string; values: number[] }[]
}

export type FynnProposalPreview = {
  proposalId: string
  summary: string
  preview: unknown
}

export type FynnStreamHandlers = {
  /** A chunk of assistant text as it arrives. Append to the running message. */
  onToken?: (text: string) => void
  /** A live status/reasoning line — "Looking up your transactions…" etc. */
  onThinking?: (text: string) => void
  /** The model asked for a chart to be rendered. */
  onChart?: (chart: FynnChartSpec) => void
  /** The model proposed a create/update/delete — needs user confirmation. */
  onProposal?: (proposal: FynnProposalPreview) => void
  /** Stream finished successfully. Carries the real DB ids to reconcile local state. */
  onDone?: (result: { chatId: string; userMessageId: string; messageId: string | null }) => void
  /** Something went wrong — network, auth, or an upstream AI provider error. */
  onError?: (message: string) => void
}

/**
 * Sends a message to Fynn and streams the response over SSE.
 * Uses `expo/fetch` (not the global RN fetch) because it's the one fetch
 * implementation in this stack that actually exposes a readable stream body
 * on both iOS and Android — see https://docs.expo.dev/versions/latest/sdk/fetch/
 *
 * Returns an `abort()` function the caller can use to cancel mid-stream.
 */
export function sendFynnMessageStream(
  message: string,
  chatId: string | undefined,
  handlers: FynnStreamHandlers,
): { abort: () => void } {
  const controller = new AbortController()

  ;(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      if (!accessToken) {
        handlers.onError?.('You need to be signed in to chat with Fynn.')
        return
      }

      const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/fynn-chat`
      const response = await expoFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          apikey: process.env.EXPO_PUBLIC_SUPABASE_KEY!,
        },
        body: JSON.stringify({ message, ...(chatId ? { chat_id: chatId } : {}) }),
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        const text = await response.text().catch(() => '')
        let parsed: { code?: string; error?: string } | null = null
        try {
          parsed = JSON.parse(text)
        } catch {
          parsed = null
        }
        if (parsed?.code === 'SUBSCRIPTION_REQUIRED') {
          handlers.onError?.('Subscribe to Fynn Pro to chat.')
          return
        }
        if (parsed?.code === 'DAILY_LIMIT') {
          handlers.onError?.('Daily limit reached. Come back after midnight IST.')
          return
        }
        handlers.onError?.(parsed?.error || text || `Request failed (${response.status})`)
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''

        for (const rawEvent of events) {
          const line = rawEvent.split('\n').find((l) => l.startsWith('data:'))
          if (!line) continue
          const jsonStr = line.slice(5).trim()
          if (!jsonStr) continue

          let event: Record<string, unknown>
          try {
            event = JSON.parse(jsonStr)
          } catch {
            continue
          }

          switch (event.type) {
            case 'token':
              handlers.onToken?.(String(event.text ?? ''))
              break
            case 'thinking':
              handlers.onThinking?.(String(event.text ?? ''))
              break
            case 'chart':
              handlers.onChart?.(event.chart as FynnChartSpec)
              break
            case 'proposal':
              handlers.onProposal?.({
                proposalId: String(event.proposalId),
                summary: String(event.summary ?? ''),
                preview: event.preview,
              })
              break
            case 'done':
              handlers.onDone?.({
                chatId: String(event.chatId),
                userMessageId: String(event.userMessageId),
                messageId: event.messageId ? String(event.messageId) : null,
              })
              break
            case 'error':
              handlers.onError?.(String(event.message ?? 'Something went wrong'))
              break
          }
        }
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return
      handlers.onError?.(e instanceof Error ? e.message : 'Fynn could not respond. Please try again.')
    }
  })()

  return { abort: () => controller.abort() }
}

export type FynnStoredMessage = {
  id: string
  role: 'assistant' | 'user'
  content: string
  created_at: string
  proposal_metadata?: {
    id: string
    summary: string
    preview: unknown
    status: 'pending' | 'accepted' | 'rejected'
  } | null
  chart_metadata?: FynnChartSpec | null
}

export type FynnStoredChat = {
  id: string
  title: string
  updated_at?: string
  fynn_messages?: FynnStoredMessage[]
}

export async function loadFynnChats(): Promise<ResponseType & { data?: FynnStoredChat[] }> {
  const { data, error } = await supabase
    .from('fynn_chats')
    .select('id, title, updated_at, fynn_messages(id, role, content, proposal_metadata, chart_metadata, created_at)')
    .order('updated_at', { ascending: false })

  if (error) return { success: false, msg: error.message }
  return { success: true, data: (data || []) as FynnStoredChat[] }
}

export async function updateFynnProposalMessage(
  messageId: string,
  proposalMetadata: NonNullable<FynnStoredMessage['proposal_metadata']>
): Promise<ResponseType> {
  const { error } = await supabase
    .from('fynn_messages')
    .update({ proposal_metadata: proposalMetadata })
    .eq('id', messageId)

  if (error) return { success: false, msg: error.message }
  return { success: true }
}

export async function confirmFynnProposal(
  proposalId: string,
  action: 'accept' | 'reject'
): Promise<ResponseType & { data?: unknown }> {
  const { data, error } = await supabase.functions.invoke('fynn-confirm', {
    body: { proposal_id: proposalId, action },
  })

  if (error) return { success: false, msg: error.message }
  if (data?.error) return { success: false, msg: String(data.error) }
  return { success: true, data }
}
