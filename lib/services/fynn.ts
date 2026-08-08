import { supabase } from '@/lib/supabase'
import { ResponseType } from '@/types'

export type FynnChatResponse =
  | { type: 'message'; text: string }
  | { type: 'proposal'; proposalId: string; summary: string; preview: unknown; text?: string }

export async function sendFynnMessage(
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[] = []
): Promise<ResponseType & { data?: FynnChatResponse }> {
  const { data, error } = await supabase.functions.invoke('fynn-chat', {
    body: { message, history },
  })

  if (error) return { success: false, msg: error.message }
  if (data?.error) return { success: false, msg: String(data.error) }
  return { success: true, data: data as FynnChatResponse }
}
