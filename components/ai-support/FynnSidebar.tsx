import Typo from '@/components/Typo'
import { Heart, Plus, X } from 'phosphor-react-native'
import React, { useEffect, useMemo, useRef } from 'react'
import {
  Animated,
  Dimensions,
  Easing,
  Pressable,
  ScrollView,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export const FYNN_SIDEBAR_WIDTH = Math.min(Dimensions.get('window').width * 0.8, 320)

export type FynnSidebarChat = {
  id: string
  title: string
  updatedAt: string
}

type Props = {
  open: boolean
  chats: FynnSidebarChat[]
  activeChatId: string | null
  onClose: () => void
  onNewChat: () => void
  onSelectChat: (chatId: string) => void
}

type ChatGroup = {
  key: 'today' | 'yesterday' | 'week' | 'earlier'
  title: string
  chats: FynnSidebarChat[]
}

function daysAgo(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  return Math.round((startOfToday - startOfDay) / 86400000)
}

function groupChats(chats: FynnSidebarChat[]): ChatGroup[] {
  const today: FynnSidebarChat[] = []
  const yesterday: FynnSidebarChat[] = []
  const thisWeek: FynnSidebarChat[] = []
  const earlier: FynnSidebarChat[] = []

  for (const chat of chats) {
    const age = daysAgo(chat.updatedAt)
    if (age <= 0) today.push(chat)
    else if (age === 1) yesterday.push(chat)
    else if (age <= 7) thisWeek.push(chat)
    else earlier.push(chat)
  }

  return [
    { key: 'today', title: 'Today', chats: today },
    { key: 'yesterday', title: 'Yesterday', chats: yesterday },
    { key: 'week', title: 'This week', chats: thisWeek },
    { key: 'earlier', title: 'Earlier', chats: earlier },
  ].filter((group) => group.chats.length > 0)
}

export default function FynnSidebar({
  open,
  chats,
  activeChatId,
  onClose,
  onNewChat,
  onSelectChat,
}: Props) {
  const insets = useSafeAreaInsets()
  const translateX = useRef(new Animated.Value(-FYNN_SIDEBAR_WIDTH)).current
  const overlayOpacity = useRef(new Animated.Value(0)).current
  const groups = useMemo(() => groupChats(chats), [chats])

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: open ? 0 : -FYNN_SIDEBAR_WIDTH,
        duration: open ? 280 : 240,
        easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: open ? 1 : 0,
        duration: open ? 280 : 240,
        useNativeDriver: true,
      }),
    ]).start()
  }, [open, overlayOpacity, translateX])

  return (
    <View pointerEvents={open ? 'box-none' : 'none'} className="absolute inset-0 z-30">
      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          opacity: overlayOpacity,
        }}
      >
        <Pressable accessibilityLabel="Close recent chats" onPress={onClose} className="flex-1" />
      </Animated.View>
      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        className="absolute bottom-0 top-0 bg-neutral-900 px-4 pb-6"
        style={{
          width: FYNN_SIDEBAR_WIDTH,
          paddingTop: Math.max(insets.top, 18),
          transform: [{ translateX }],
        }}
      >
        <View className="h-12 flex-row items-center justify-between">
          <Typo size={18} fontWeight="600" className="text-neutral-100">Recent chats</Typo>
          <TouchableOpacity accessibilityLabel="Close recent chats" onPress={onClose} className="h-[38px] w-[38px] items-center justify-center rounded-full">
            <X size={20} color="#f5f5f5" weight="bold" />
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={onNewChat} className="mb-[18px] mt-4 h-[46px] flex-row items-center justify-center gap-[9px] rounded-[14px] bg-lime-400">
          <Plus size={18} color="#171717" weight="bold" />
          <Typo size={14} fontWeight="600" color="#171717">New chat</Typo>
        </TouchableOpacity>
        {chats.length === 0 ? (
          <Typo size={14} className="mt-3 text-center text-neutral-500">Your conversations will appear here.</Typo>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {groups.map((group) => (
              <View key={group.key} className="mb-4">
                <Typo size={12} fontWeight="600" className="mb-1.5 px-[11px] text-neutral-500">
                  {group.title}
                </Typo>
                {group.chats.map((chat) => (
                  <TouchableOpacity
                    key={chat.id}
                    onPress={() => onSelectChat(chat.id)}
                    className={`min-h-12 flex-row items-center gap-2.5 rounded-xl px-[11px] py-2 ${chat.id === activeChatId ? 'bg-neutral-800' : ''}`}
                  >
                    <Heart size={16} color={chat.id === activeChatId ? '#a3e635' : '#a3a3a3'} weight="fill" />
                    <Typo textProps={{ numberOfLines: 1 }} size={14} className="flex-1 text-neutral-200">
                      {chat.title}
                    </Typo>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </ScrollView>
        )}
      </Animated.View>
    </View>
  )
}
