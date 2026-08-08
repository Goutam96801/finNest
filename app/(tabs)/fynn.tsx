import ScreenWrapper from '@/components/ScreenWrapper'
import Typo from '@/components/Typo'
import {
  confirmFynnProposal,
  type FynnStoredChat,
  loadFynnChats,
  sendFynnMessage,
  updateFynnProposalMessage,
} from '@/lib/services/fynn'
import { LinearGradient } from 'expo-linear-gradient'
import { ArrowUp, Heart, List, Plus, X } from 'phosphor-react-native'
import React, { useEffect, useRef, useState } from 'react'
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type ChatMessage = {
  id: string
  role: 'assistant' | 'user'
  text: string
  proposal?: {
    id: string
    summary: string
    preview: unknown
    status: 'pending' | 'accepted' | 'rejected'
  }
}
type Chat = { id: string; title: string; messages: ChatMessage[] }

const starterPrompts = [
  'Help me build a budget',
  'Where can I save this month?',
  'Explain my spending',
]

export default function Fynn() {
  const insets = useSafeAreaInsets()
  const heartScale = useRef(new Animated.Value(1)).current
  const [chats, setChats] = useState<Chat[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [confirmingProposalIds, setConfirmingProposalIds] = useState<string[]>([])

  const activeChat = chats.find((chat) => chat.id === activeChatId)
  const messages = activeChat?.messages ?? []

  useEffect(() => {
    const loadChats = async () => {
      const response = await loadFynnChats()
      if (!response.success || !response.data) return

      setChats(response.data.map((chat: FynnStoredChat) => ({
        id: chat.id,
        title: chat.title,
        messages: [...(chat.fynn_messages || [])].sort(
          (a, b) => a.created_at.localeCompare(b.created_at)
        ).map((message) => ({
          id: message.id,
          role: message.role,
          text: message.content,
          proposal: message.proposal_metadata || undefined,
        })),
      })))
    }

    void loadChats()
  }, [])

  useEffect(() => {
    if (messages.length > 0) return

    const heartbeat = Animated.loop(
      Animated.sequence([
        Animated.timing(heartScale, { toValue: 1.2, duration: 1000, useNativeDriver: true }),
        Animated.timing(heartScale, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.delay(500),
      ])
    )
    heartbeat.start()
    return () => heartbeat.stop()
  }, [heartScale, messages.length])

  const startNewChat = () => {
    setActiveChatId(null)
    setDraft('')
    setIsSidebarOpen(false)
  }

  const sendMessage = async (text = draft) => {
    const cleanText = text.trim()
    if (!cleanText || isSending) return

    const timestamp = Date.now()
    const userMessage: ChatMessage = { id: `${timestamp}-user`, role: 'user', text: cleanText }
    const chatId = activeChatId ?? `${timestamp}`

    if (activeChatId) {
      setChats((current) => current.map((chat) => (
        chat.id === activeChatId
          ? { ...chat, messages: [...chat.messages, userMessage] }
          : chat
      )))
    } else {
      const newChat: Chat = {
        id: chatId,
        title: cleanText,
        messages: [userMessage],
      }
      setChats((current) => [newChat, ...current])
      setActiveChatId(newChat.id)
    }
    setDraft('')
    setIsSending(true)

    try {
      const response = await sendFynnMessage(cleanText, activeChatId ?? undefined)
      const persistedChatId = response.success ? response.data?.chatId : undefined
      const persistedUserMessageId = response.success ? response.data?.userMessageId : undefined
      const assistantMessage: ChatMessage = {
        id: response.success ? response.data?.messageId || `${timestamp}-assistant` : `${timestamp}-assistant`,
        role: 'assistant',
        text: response.success && response.data?.type === 'proposal'
          ? response.data.text || 'Please confirm this change.'
          : response.success && response.data?.type === 'message'
            ? response.data.text
            : response.msg || 'Fynn could not respond. Please try again.',
        proposal: response.success && response.data?.type === 'proposal'
          ? {
              id: response.data.proposalId,
              summary: response.data.summary,
              preview: response.data.preview,
              status: 'pending',
            }
          : undefined,
      }
      setChats((current) => current.map((chat) => (
        chat.id === chatId
          ? {
              ...chat,
              id: persistedChatId || chat.id,
              messages: [
                ...chat.messages.map((message) => (
                  message.id === userMessage.id && persistedUserMessageId
                    ? { ...message, id: persistedUserMessageId }
                    : message
                )),
                assistantMessage,
              ],
            }
          : chat
      )))
      if (persistedChatId && !activeChatId) setActiveChatId(persistedChatId)
    } catch {
      setChats((current) => current.map((chat) => (
        chat.id === chatId
          ? {
              ...chat,
              messages: [
                ...chat.messages,
                {
                  id: `${timestamp}-assistant`,
                  role: 'assistant',
                  text: 'Fynn could not respond. Please try again.',
                },
              ],
            }
          : chat
      )))
    } finally {
      setIsSending(false)
    }
  }

  const confirmProposal = async (
    chatId: string,
    messageId: string,
    proposalId: string,
    action: 'accept' | 'reject'
  ) => {
    if (confirmingProposalIds.includes(proposalId)) return
    setConfirmingProposalIds((current) => [...current, proposalId])

    try {
      const response = await confirmFynnProposal(proposalId, action)
      if (!response.success) return

      const status: 'accepted' | 'rejected' = action === 'accept' ? 'accepted' : 'rejected'
      const chat = chats.find((item) => item.id === chatId)
      const message = chat?.messages.find((item) => item.id === messageId)
      if (message?.proposal) {
        await updateFynnProposalMessage(messageId, { ...message.proposal, status })
      }
      if (
        action === 'accept'
        && typeof response.data === 'object'
        && response.data !== null
        && (response.data as { reminderResyncRequired?: unknown }).reminderResyncRequired === true
      ) {
        const { resyncSubscriptionRemindersForUser } = await import('@/lib/services/localReminders')
        const { data: { user } } = await (await import('@/lib/supabase')).supabase.auth.getUser()
        if (user) await resyncSubscriptionRemindersForUser(user.id)
      }
      setChats((current) => current.map((chat) => (
        chat.id === chatId
          ? {
              ...chat,
              messages: [
                ...chat.messages.map((message) => (
                  message.id === messageId && message.proposal
                    ? { ...message, proposal: { ...message.proposal, status } }
                    : message
                )),
                ...(action === 'accept'
                  ? [{
                      id: `${Date.now()}-confirmation`,
                      role: 'assistant' as const,
                      text: 'Transaction confirmed and applied.',
                    }]
                  : []),
              ],
            }
          : chat
      )))
    } finally {
      setConfirmingProposalIds((current) => current.filter((id) => id !== proposalId))
    }
  }

  return (
    <ScreenWrapper >
      <KeyboardAvoidingView
        className="flex-1"
        behavior={'padding'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <View className="h-[58px] flex-row items-center justify-between px-4">
          <TouchableOpacity
            accessibilityLabel="Open recent chats"
            onPress={() => setIsSidebarOpen(true)}
            className="h-[42px] w-[42px] items-center justify-center rounded-full"
          >
            <List size={23} color="#f5f5f5" weight="bold" />
          </TouchableOpacity>
          <View className="flex-row items-center gap-2">
            <Typo size={18} fontWeight="600" className="text-neutral-100">Fynn</Typo>
          </View>
          <TouchableOpacity accessibilityLabel="Start new chat" onPress={startNewChat} className="h-[42px] w-[42px] items-center justify-center rounded-full">
            <Plus size={23} color="#f5f5f5" weight="bold" />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className={`flex-1 px-5 pb-28 pt-[18px] ${messages.length === 0 ? 'justify-center' : ''}`}>
            {messages.length === 0 ? (
              <View className="-mt-7 items-center">
                <Animated.View className="mb-5 h-[90px] w-[90px] items-center justify-center" style={{ transform: [{ scale: heartScale }] }}>
                  <Heart size={90} color="#a3e635" weight="fill" />
                </Animated.View>
                <Typo size={25} fontWeight="600" className="text-neutral-100">How can I help?</Typo>
                <Typo size={14} className="mt-[7px] text-center text-neutral-400">
                  Ask anything about your money.
                </Typo>
                <View className="mt-[27px] w-full items-center gap-[9px]">
                  {starterPrompts.map((prompt) => (
                    <TouchableOpacity key={prompt} disabled={isSending} onPress={() => sendMessage(prompt)} className="rounded-full border border-neutral-700 px-[15px] py-2.5">
                      <Typo size={13} className="text-neutral-300">{prompt}</Typo>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : messages.map((message) => (
              <View key={message.id} className={`mb-3.5 flex-row items-end gap-2 ${message.role === 'user' ? 'justify-end' : ''}`}>
                {message.role === 'assistant' ?
                  <View className="h-7 w-7 items-center justify-center rounded-full bg-lime-400">
                    <Heart size={14} color="#171717" weight="fill" />
                  </View> : null
                }
                <View className={`max-w-[82%] rounded-[18px] px-3.5 py-[11px] ${message.role === 'user' ? 'rounded-br-[5px] bg-lime-400' : 'rounded-bl-[5px] bg-neutral-800'}`}>
                  <Typo size={15} className={message.role === 'user' ? 'text-neutral-900' : 'text-neutral-100'}>{message.text}</Typo>
                  {message.proposal ? (
                    <View className="mt-3 rounded-xl border border-neutral-700 bg-neutral-900 p-3">
                      <Typo size={14} fontWeight="600" className="text-neutral-100">{message.proposal.summary}</Typo>
                      {message.proposal.status === 'pending' ? (
                        <View className="mt-3 flex-row gap-2">
                          <TouchableOpacity
                            accessibilityLabel="Accept proposed transaction"
                            disabled={confirmingProposalIds.includes(message.proposal.id)}
                            onPress={() => confirmProposal(activeChatId!, message.id, message.proposal!.id, 'accept')}
                            className={`flex-1 rounded-lg px-3 py-2 ${confirmingProposalIds.includes(message.proposal.id) ? 'bg-neutral-700' : 'bg-lime-400'}`}
                          >
                            <Typo size={13} fontWeight="600" className="text-center text-neutral-900">Accept</Typo>
                          </TouchableOpacity>
                          <TouchableOpacity
                            accessibilityLabel="Reject proposed transaction"
                            disabled={confirmingProposalIds.includes(message.proposal.id)}
                            onPress={() => confirmProposal(activeChatId!, message.id, message.proposal!.id, 'reject')}
                            className="flex-1 rounded-lg bg-neutral-700 px-3 py-2"
                          >
                            <Typo size={13} fontWeight="600" className="text-center text-neutral-100">Reject</Typo>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <Typo size={13} className="mt-2 text-neutral-400">
                          {message.proposal.status === 'accepted' ? 'Accepted' : 'Rejected'}
                        </Typo>
                      )}
                    </View>
                  ) : null}
                </View>
              </View>
            ))}
            {isSending ? (
              <View className="mb-3.5 flex-row items-end gap-2">
                <View className="h-7 w-7 items-center justify-center rounded-full bg-lime-400">
                  <Heart size={14} color="#171717" weight="fill" />
                </View>
                <View className="rounded-[18px] rounded-bl-[5px] bg-neutral-800 px-3.5 py-[11px]">
                  <Typo size={15} className="text-neutral-400">Fynn is thinking...</Typo>
                </View>
              </View>
            ) : null}
          </View>
        </ScrollView>

        <LinearGradient
          pointerEvents="none"
          colors={['rgba(23, 23, 23, 0)', '#171717']}
          locations={[0, 0.82]}
          style={{ position: 'absolute', right: 0, bottom: 0, left: 0, height: 170, zIndex: 5 }}
        />

        <View className="absolute bottom-0 left-0 right-0 z-10 bg-transparent px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 14) }}>
          <View className="max-h-[120px] min-h-[54px] flex-row items-end rounded-[20px] bg-neutral-800 pl-[15px] pr-1.5">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={() => sendMessage()}
              editable={!isSending}
              placeholder="Ask Fynn..."
              placeholderTextColor="#737373"
              className="max-h-24 flex-1 py-[15px] text-[15px] leading-5 text-neutral-100"
              multiline
              maxLength={500}
              returnKeyType="send"
            />
            <TouchableOpacity accessibilityLabel="Send message" disabled={!draft.trim() || isSending} onPress={() => sendMessage()} className={`mb-1.5 h-[42px] w-[42px] items-center justify-center rounded-full ${draft.trim() && !isSending ? 'bg-lime-400' : 'bg-neutral-700'}`}>
              <ArrowUp size={20} color={draft.trim() && !isSending ? '#171717' : '#737373'} weight="bold" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {isSidebarOpen ? (
        <View className="absolute inset-0 z-10 flex-row">
          <Pressable accessibilityLabel="Close recent chats" onPress={() => setIsSidebarOpen(false)} className="flex-1 bg-black/60" />
          <View className="w-4/5 max-w-80 bg-neutral-900 px-4 pb-6" style={{ paddingTop: Math.max(insets.top, 18) }}>
            <View className="h-12 flex-row items-center justify-between">
              <Typo size={18} fontWeight="600" className="text-neutral-100">Recent chats</Typo>
              <TouchableOpacity accessibilityLabel="Close recent chats" onPress={() => setIsSidebarOpen(false)} className="h-[38px] w-[38px] items-center justify-center rounded-full">
                <X size={20} color="#f5f5f5" weight="bold" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={startNewChat} className="mb-[18px] mt-4 h-[46px] flex-row items-center justify-center gap-[9px] rounded-[14px] bg-lime-400">
              <Plus size={18} color="#171717" weight="bold" />
              <Typo size={14} fontWeight="600" className="text-neutral-900">New chat</Typo>
            </TouchableOpacity>
            {chats.length === 0 ? (
              <Typo size={14} className="mt-3 text-center text-neutral-500">Your conversations will appear here.</Typo>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {chats.map((chat) => (
                  <TouchableOpacity
                    key={chat.id}
                    onPress={() => { setActiveChatId(chat.id); setIsSidebarOpen(false) }}
                    className={`min-h-12 flex-row items-center gap-2.5 rounded-xl px-[11px] ${chat.id === activeChatId ? 'bg-neutral-800' : ''}`}
                  >
                    <Heart size={16} color={chat.id === activeChatId ? '#a3e635' : '#a3a3a3'} weight="fill" />
                    <Typo textProps={{ numberOfLines: 1 }} size={14} className="flex-1 text-neutral-200">{chat.title}</Typo>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      ) : null}
    </ScreenWrapper>
  )
}
