import { supabase } from '@/lib/supabase'
import { ResponseType } from '@/types'

export type FynnChatResponse =
  | {
    type: 'message'
    text: string
    chatId: string
    userMessageId: string
    messageId: string
  }
  | {
    type: 'proposal'
    proposalId: string
    summary: string
    preview: unknown
    text?: string
    chatId: string
    userMessageId: string
    messageId: string
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
}

export type FynnStoredChat = {
  id: string
  title: string
  fynn_messages?: FynnStoredMessage[]
}

export async function sendFynnMessage(
  message: string,
  chatId?: string
): Promise<ResponseType & { data?: FynnChatResponse }> {
  const { data, error } = await supabase.functions.invoke('fynn-chat', {
    body: { message, ...(chatId ? { chat_id: chatId } : {}) },
  })

  if (error) return { success: false, msg: error.message }
  if (data?.error) return { success: false, msg: String(data.error) }
  return { success: true, data: data as FynnChatResponse }
}

export async function loadFynnChats(): Promise<ResponseType & { data?: FynnStoredChat[] }> {
  const { data, error } = await supabase
    .from('fynn_chats')
    .select('id, title, fynn_messages(id, role, content, proposal_metadata, created_at)')
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
