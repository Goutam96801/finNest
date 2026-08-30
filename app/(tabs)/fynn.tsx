import ChatChart from '@/components/ai-support/ChatChart'
import ChatMarkdown from '@/components/ai-support/ChatMarkdown'
import FynnLockOverlay from '@/components/ai-support/FynnLockOverlay'
import FynnSidebar from '@/components/ai-support/FynnSidebar'
import ScreenWrapper from '@/components/ScreenWrapper'
import Typo from '@/components/Typo'
import { useFynnPro } from '@/context/fynnProContext'
import {
  confirmFynnProposal,
  sendFynnMessageStream,
  type FynnChartSpec,
  type FynnStoredChat,
  loadFynnChats,
  updateFynnProposalMessage,
} from '@/lib/services/fynn'
import { LinearGradient } from 'expo-linear-gradient'
import { useFocusEffect } from 'expo-router'
import VoiceRecorderBar from '@/components/ai-support/VoiceRecorderBar'
import { transcribeAudio } from '@/lib/services/voiceTranscription'
import { ArrowUp, Heart, List, Plus, Microphone } from 'phosphor-react-native'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const LINE_HEIGHT = 20
const MAX_INPUT_LINES = 3
const MAX_INPUT_HEIGHT = LINE_HEIGHT * MAX_INPUT_LINES

type ChatMessage = {
  id: string
  role: 'assistant' | 'user'
  text: string
  createdAt: string
  /** Live status/reasoning trace while the response is still streaming in. */
  thinking?: string
  isStreaming?: boolean
  chart?: FynnChartSpec
  proposal?: {
    id: string
    summary: string
    preview: unknown
    status: 'pending' | 'accepted' | 'rejected'
  }
}
type Chat = { id: string; title: string; updatedAt: string; messages: ChatMessage[] }

const starterPrompts = [
  'Help me build a budget',
  'Where can I save this month?',
  'Explain my spending',
]

function formatMessageTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function formatDayLabel(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const diffDays = Math.round((startOfToday - startOfDay) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}

function isSameCalendarDay(a: string, b: string) {
  const left = new Date(a)
  const right = new Date(b)
  return (
    left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
  )
}

function latestThinkingPreview(thinking: string) {
  const trimmed = thinking.trim()
  if (!trimmed) return 'Thinking…'
  const lines = trimmed.split(/\n+/).filter(Boolean)
  const last = lines[lines.length - 1] ?? trimmed
  if (last.length <= 88) return last
  return `…${last.slice(-88).trimStart()}`
}

function ScalingHeart({ size, animating, color }: { size: number; animating: boolean; color: string }) {
  const scale = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (!animating) {
      scale.setValue(1)
      return
    }
    const beat = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.28, duration: 700, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    )
    beat.start()
    return () => {
      beat.stop()
      scale.setValue(1)
    }
  }, [animating, scale])

  return (
    <Animated.View className="h-7 w-7 items-center justify-center" style={{ transform: [{ scale }] }}>
      <Heart size={size} color={color} weight="fill" />
    </Animated.View>
  )
}

function DaySeparator({ label }: { label: string }) {
  return (
    <View className="mb-4 mt-1 flex-row items-center gap-3">
      <View className="h-px flex-1 bg-neutral-800" />
      <Typo size={11} className="text-neutral-500">{label}</Typo>
      <View className="h-px flex-1 bg-neutral-800" />
    </View>
  )
}

export default function Fynn() {
  const insets = useSafeAreaInsets()
  const { locked, lockReason, refresh: refreshFynnPro } = useFynnPro()
  const heartScale = useRef(new Animated.Value(1)).current
  const [chats, setChats] = useState<Chat[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [expandedThinkingId, setExpandedThinkingId] = useState<string | null>(null)
  const [confirmingProposalIds, setConfirmingProposalIds] = useState<string[]>([])
  const [keyboardInset, setKeyboardInset] = useState(0)
  const [isRecordingVoice, setIsRecordingVoice] = useState(false)
  const [inputContentHeight, setInputContentHeight] = useState(LINE_HEIGHT)
  const abortRef = useRef<(() => void) | null>(null)
  const scrollRef = useRef<ScrollView>(null)

  const activeChat = chats.find((chat) => chat.id === activeChatId)
  const messages = activeChat?.messages ?? []

  useEffect(() => {
    const loadChats = async () => {
      const response = await loadFynnChats()
      if (!response.success || !response.data) return

      setChats(response.data.map((chat: FynnStoredChat) => {
        const messages = [...(chat.fynn_messages || [])].sort(
          (a, b) => a.created_at.localeCompare(b.created_at)
        ).map((message) => ({
          id: message.id,
          role: message.role,
          text: message.content,
          createdAt: message.created_at,
          proposal: message.proposal_metadata || undefined,
          chart: message.chart_metadata || undefined,
        }))
        const lastMessageAt = messages[messages.length - 1]?.createdAt
        return {
          id: chat.id,
          title: chat.title,
          updatedAt: chat.updated_at || lastMessageAt || new Date().toISOString(),
          messages,
        }
      }))
    }

    void loadChats()
  }, [])

  useFocusEffect(useCallback(() => {
    void refreshFynnPro()
  }, [refreshFynnPro]))

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

  // Cancel any in-flight stream if the screen unmounts mid-response.
  useEffect(() => () => abortRef.current?.(), [])

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const onShow = Keyboard.addListener(showEvent, (event) => {
      setKeyboardInset(event.endCoordinates.height)
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }))
    })
    const onHide = Keyboard.addListener(hideEvent, () => setKeyboardInset(0))
    return () => {
      onShow.remove()
      onHide.remove()
    }
  }, [])

  useEffect(() => {
    if (!draft) setInputContentHeight(LINE_HEIGHT)
  }, [draft])

  const openSidebar = () => setIsSidebarOpen(true)
  const closeSidebar = () => setIsSidebarOpen(false)

  const startNewChat = () => {
    abortRef.current?.()
    setActiveChatId(null)
    setDraft('')
    if (isSidebarOpen) closeSidebar()
  }

  const patchMessage = (chatId: string, messageId: string, patch: Partial<ChatMessage>) => {
    setChats((current) => current.map((chat) => (
      chat.id === chatId
        ? {
          ...chat,
          messages: chat.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
        }
        : chat
    )))
  }

  const sendMessage = (text = draft) => {
    const cleanText = text.trim()
    if (!cleanText || isSending || locked) return

    const timestamp = Date.now()
    const createdAt = new Date(timestamp).toISOString()
    const userMessage: ChatMessage = { id: `${timestamp}-user`, role: 'user', text: cleanText, createdAt }
    const assistantId = `${timestamp}-assistant`
    const assistantPlaceholder: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      text: '',
      createdAt,
      thinking: 'Thinking…',
      isStreaming: true,
    }
    const localChatId = activeChatId ?? `${timestamp}`

    if (activeChatId) {
      setChats((current) => current.map((chat) => (
        chat.id === activeChatId
          ? { ...chat, updatedAt: createdAt, messages: [...chat.messages, userMessage, assistantPlaceholder] }
          : chat
      )))
    } else {
      const newChat: Chat = {
        id: localChatId,
        title: cleanText,
        updatedAt: createdAt,
        messages: [userMessage, assistantPlaceholder],
      }
      setChats((current) => [newChat, ...current])
      setActiveChatId(newChat.id)
    }
    setDraft('')
    setIsSending(true)
    setExpandedThinkingId(null)

    let sawFirstToken = false
    let accumulatedText = ''
    let accumulatedThinking = ''

    const { abort } = sendFynnMessageStream(cleanText, activeChatId ?? undefined, {
      onThinking: (chunk) => {
        accumulatedThinking += chunk
        if (!sawFirstToken) patchMessage(localChatId, assistantId, { thinking: accumulatedThinking })
      },
      onToken: (chunk) => {
        sawFirstToken = true
        accumulatedText += chunk
        setExpandedThinkingId((current) => (current === assistantId ? null : current))
        patchMessage(localChatId, assistantId, { text: accumulatedText, thinking: undefined })
      },
      onChart: (chart) => {
        patchMessage(localChatId, assistantId, { chart })
      },
      onProposal: ({ proposalId, summary, preview }) => {
        patchMessage(localChatId, assistantId, {
          proposal: { id: proposalId, summary, preview, status: 'pending' },
        })
      },
      onDone: ({ chatId: persistedChatId, userMessageId, messageId }) => {
        setChats((current) => current.map((chat) => (
          chat.id === localChatId
            ? {
              ...chat,
              id: persistedChatId,
              updatedAt: new Date().toISOString(),
              messages: chat.messages.map((m) => {
                if (m.id === userMessage.id) return { ...m, id: userMessageId }
                if (m.id === assistantId) {
                  return {
                    ...m,
                    id: messageId ?? m.id,
                    isStreaming: false,
                    thinking: undefined,
                    text: m.text || (m.proposal ? m.proposal.summary : 'Done.'),
                  }
                }
                return m
              }),
            }
            : chat
        )))
        if (!activeChatId) setActiveChatId(persistedChatId)
        setIsSending(false)
        abortRef.current = null
        void refreshFynnPro()
      },
      onError: (message) => {
        if (message.includes('Subscribe') || message.includes('Daily limit')) {
          void refreshFynnPro()
        }
        patchMessage(localChatId, assistantId, {
          isStreaming: false,
          thinking: undefined,
          text: message || 'Fynn could not respond. Please try again.',
        })
        setIsSending(false)
        abortRef.current = null
      },
    })

    abortRef.current = abort
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
      if (action === 'accept') {
        const { data: { user } } = await (await import('@/lib/supabase')).supabase.auth.getUser()
        if (user) {
          const { queueLowBalanceCheck } = await import('@/lib/services/lowBalanceAlerts')
          queueLowBalanceCheck(user.id)
          if (
            typeof response.data === 'object'
            && response.data !== null
            && (response.data as { reminderResyncRequired?: unknown }).reminderResyncRequired === true
          ) {
            const { resyncSubscriptionRemindersForUser } = await import('@/lib/services/localReminders')
            await resyncSubscriptionRemindersForUser(user.id)
          }
        }
      }
      setChats((current) => current.map((chat) => (
        chat.id === chatId
          ? {
            ...chat,
            updatedAt: new Date().toISOString(),
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
                  createdAt: new Date().toISOString(),
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <View className="h-[58px] flex-row items-center justify-between px-4">
          <TouchableOpacity
            accessibilityLabel="Open recent chats"
            onPress={openSidebar}
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
          ref={scrollRef}
          contentContainerStyle={{ flexGrow: 1 }}
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          <View className={`flex-1 px-5 pb-4 pt-[18px] ${messages.length === 0 ? 'justify-center' : ''}`}>
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
                    <TouchableOpacity key={prompt} disabled={isSending || locked} onPress={() => sendMessage(prompt)} className="rounded-full border border-neutral-700 px-[15px] py-2.5">
                      <Typo size={13} className="text-neutral-300">{prompt}</Typo>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : messages.map((message, index) => {
              const isThinking = message.role === 'assistant' && !!message.thinking && !message.text
              const thinkingExpanded = expandedThinkingId === message.id
              const showDaySeparator = index === 0 || !isSameCalendarDay(messages[index - 1].createdAt, message.createdAt)
              const dayLabel = formatDayLabel(message.createdAt)
              const timeLabel = formatMessageTime(message.createdAt)

              return (
                <View key={message.id} className="mb-3.5">
                  {showDaySeparator && dayLabel ? <DaySeparator label={dayLabel} /> : null}
                  <View className={`flex-row gap-2 ${message.role === 'user' ? 'justify-end' : 'items-start'}`}>
                    {message.role === 'assistant' ? (
                      <ScalingHeart
                        size={14}
                        animating={isThinking}
                        color={isThinking ? '#a3e635' : '#a3a3a3'}
                      />
                    ) : null}
                    <View className={message.role === 'user' ? 'max-w-[82%] items-end' : 'min-w-0 flex-1'}>
                      {isThinking ? (
                        <Pressable
                          accessibilityLabel={thinkingExpanded ? 'Hide thinking' : 'Show thinking'}
                          onPress={() => setExpandedThinkingId(thinkingExpanded ? null : message.id)}
                          className="py-1 pr-2"
                        >
                          {thinkingExpanded ? (
                            <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                              <Typo size={13} className="italic text-neutral-500">{message.thinking}</Typo>
                            </ScrollView>
                          ) : (
                            <Typo size={13} className="italic text-neutral-500">
                              {latestThinkingPreview(message.thinking || '')}
                            </Typo>
                          )}
                        </Pressable>
                      ) : message.text ? (
                        <View className={`rounded-[18px] px-3.5 py-[11px] ${message.role === 'user' ? 'rounded-br-[5px] bg-lime-400/45' : 'rounded-bl-[5px] bg-neutral-800'}`}>
                          {message.role === 'user' ? (
                            <Typo size={15} className="text-neutral-100">{message.text}</Typo>
                          ) : (
                            <ChatMarkdown content={message.text} />
                          )}
                        </View>
                      ) : null}
                      {message.chart ? <ChatChart chart={message.chart} /> : null}
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
                      {timeLabel ? (
                        <Typo size={11} className={`mt-1 text-neutral-500 ${message.role === 'user' ? 'text-right' : ''}`}>
                          {timeLabel}
                        </Typo>
                      ) : null}
                    </View>
                  </View>
                </View>
              )
            })}
          </View>
        </ScrollView>

        <LinearGradient
          pointerEvents="none"
          colors={['rgba(23, 23, 23, 0)', '#171717']}
          locations={[0, 1]}
          style={{ height: 28, marginBottom: -8, zIndex: 5 }}
        />

        <View
          className="z-10 bg-[#171717] px-4 pt-2"
          style={{ paddingBottom: keyboardInset > 0 ? 8 : Math.max(insets.bottom, 14) }}
        >
          {isRecordingVoice ? (
            <VoiceRecorderBar
              transcribe={transcribeAudio}
              onTranscribed={(text) => {
                setDraft(text)
                setIsRecordingVoice(false)
              }}
              onCancel={() => setIsRecordingVoice(false)}
            />
          ) : (
            <View className="min-h-[54px] flex-row items-end rounded-[20px] bg-neutral-800 pl-[15px] pr-1.5">
              <TextInput
                value={draft}
                onChangeText={setDraft}
                onContentSizeChange={(e) => setInputContentHeight(e.nativeEvent.contentSize.height)}
                onSubmitEditing={() => sendMessage()}
                editable={!isSending && !locked}
                placeholder="Ask Fynn..."
                placeholderTextColor="#737373"
                className="flex-1 py-[15px] text-[15px] text-neutral-100"
                style={{
                  lineHeight: LINE_HEIGHT,
                  height: Math.min(Math.max(inputContentHeight, LINE_HEIGHT), MAX_INPUT_HEIGHT),
                }}
                scrollEnabled={inputContentHeight > MAX_INPUT_HEIGHT}
                multiline
                maxLength={500}
                returnKeyType="send"
              />
              {draft.trim() ? (
                <TouchableOpacity
                  accessibilityLabel="Send message"
                  disabled={isSending || locked}
                  onPress={() => sendMessage()}
                  className="mb-1.5 h-[42px] w-[42px] items-center justify-center rounded-full bg-lime-400"
                >
                  <ArrowUp size={20} color="#171717" weight="bold" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  accessibilityLabel="Record voice message"
                  disabled={isSending || locked}
                  onPress={() => setIsRecordingVoice(true)}
                  className={`mb-1.5 h-[42px] w-[42px] items-center justify-center rounded-full ${isSending || locked ? 'bg-neutral-700' : 'bg-neutral-700'}`}
                >
                  <Microphone size={19} color={isSending || locked ? '#737373' : '#f5f5f5'} weight="bold" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
        {Platform.OS === 'android' && keyboardInset > 0 ? (
          <View style={{ height: keyboardInset }} />
        ) : null}
      </KeyboardAvoidingView>

      {locked && lockReason ? <FynnLockOverlay reason={lockReason} /> : null}

      <FynnSidebar
        open={isSidebarOpen}
        chats={chats}
        activeChatId={activeChatId}
        onClose={closeSidebar}
        onNewChat={startNewChat}
        onSelectChat={(chatId) => {
          setActiveChatId(chatId)
          closeSidebar()
        }}
      />
    </ScreenWrapper>
  )
}
