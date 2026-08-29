import AppRefreshControl from '@/components/AppRefreshControl'
import BackButton from '@/components/BackButton'
import EmptyState from '@/components/EmptyState'
import Header from '@/components/Header'
import LoadMoreButton from '@/components/LoadMoreButton'
import Loading from '@/components/Loading'
import ModalWrapper from '@/components/ModalWrapper'
import NotificationDetailSheet, {
  type NotificationDetailSheetHandle,
} from '@/components/NotificationDetailSheet'
import Typo from '@/components/Typo'
import { useAuth } from '@/context/authContext'
import {
  AppNotification,
  deleteNotification,
  formatNotificationDayLabel,
  formatRelativeTime,
  getNotificationsPage,
  isSameCalendarDay,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/services/notifications'
import { useFocusEffect } from 'expo-router'
import {
  Bell,
  CheckCircle,
  Checks,
  Info,
  WarningCircle,
} from 'phosphor-react-native'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, TouchableOpacity, View } from 'react-native'
import { Swipeable } from 'react-native-gesture-handler'
import Animated, { FadeInDown } from 'react-native-reanimated'

const PAGE_SIZE = 20

const TYPE_META: Record<
  AppNotification['type'],
  { label: string; color: string; bg: string; Icon: typeof Bell }
> = {
  subscription_due: { label: 'Reminder', color: '#fbbf24', bg: '#422006', Icon: Bell },
  subscription_paid: { label: 'Paid', color: '#86efac', bg: '#14532d', Icon: CheckCircle },
  low_balance: { label: 'Balance', color: '#f87171', bg: '#7f1d1d', Icon: WarningCircle },
  system: { label: 'Update', color: '#a3a3a3', bg: '#262626', Icon: Info },
}

const FilterChip = ({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.85}
    className="rounded-full border px-3.5 py-1.5"
    style={{
      backgroundColor: active ? '#262626' : 'transparent',
      borderColor: active ? '#a3e635' : '#404040',
    }}
  >
    <Typo size={12} fontWeight="600" color={active ? '#a3e635' : '#a3a3a3'}>
      {label}
    </Typo>
  </TouchableOpacity>
)

const NotificationsModal = () => {
  const { user } = useAuth()
  const hasLoadedOnce = useRef(false)
  const requestIdRef = useRef(0)
  const itemsRef = useRef<AppNotification[]>([])
  const loadingMoreRef = useRef(false)
  const hasMoreRef = useRef(false)
  const unreadOnlyRef = useRef(false)
  const detailSheetRef = useRef<NotificationDetailSheetHandle>(null)

  const [items, setItems] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [unreadOnly, setUnreadOnly] = useState(false)

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    unreadOnlyRef.current = unreadOnly
  }, [unreadOnly])

  const load = useCallback(
    async (mode: 'reset' | 'more' = 'reset') => {
      if (!user?.id) return
      if (mode === 'more') {
        if (loadingMoreRef.current || !hasMoreRef.current) return
        loadingMoreRef.current = true
        setLoadingMore(true)
      } else if (!hasLoadedOnce.current) {
        setLoading(true)
      }

      const requestId = ++requestIdRef.current

      try {
        const offset = mode === 'more' ? itemsRef.current.length : 0
        const page = await getNotificationsPage(user.id, {
          limit: PAGE_SIZE,
          offset,
          unreadOnly: unreadOnlyRef.current,
        })

        if (requestId !== requestIdRef.current) return

        const nextItems = mode === 'more' ? [...itemsRef.current, ...page.items] : page.items
        itemsRef.current = nextItems
        hasMoreRef.current = page.hasMore
        setItems(nextItems)
        setHasMore(page.hasMore)
        hasLoadedOnce.current = true
      } catch (error) {
        console.log('Failed to load notifications', error)
      } finally {
        if (requestId === requestIdRef.current) {
          loadingMoreRef.current = false
          setLoading(false)
          setLoadingMore(false)
        }
      }
    },
    [user?.id]
  )

  useFocusEffect(
    useCallback(() => {
      load('reset')
    }, [load])
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await load('reset')
    } finally {
      setRefreshing(false)
    }
  }, [load])

  const setFilter = (nextUnreadOnly: boolean) => {
    if (nextUnreadOnly === unreadOnly) return
    unreadOnlyRef.current = nextUnreadOnly
    setUnreadOnly(nextUnreadOnly)
    hasLoadedOnce.current = false
    load('reset')
  }

  const openNotification = async (item: AppNotification) => {
    if (user?.id && !item.isRead) {
      await markNotificationRead(user.id, item.id)
      setItems((prev) =>
        prev.map((row) => (row.id === item.id ? { ...row, isRead: true } : row))
      )
    }
    detailSheetRef.current?.present({ ...item, isRead: true })
  }

  const removeNotification = async (item: AppNotification) => {
    if (!user?.id) return
    const response = await deleteNotification(user.id, item.id)
    if (!response.success) return
    const next = itemsRef.current.filter((row) => row.id !== item.id)
    itemsRef.current = next
    setItems(next)
  }

  const markAllRead = async () => {
    if (!user?.id) return
    await markAllNotificationsRead(user.id)
    if (unreadOnly) {
      itemsRef.current = []
      setItems([])
      setHasMore(false)
      return
    }
    setItems((prev) => prev.map((row) => ({ ...row, isRead: true })))
  }

  const unreadCount = items.filter((item) => !item.isRead).length

  return (
    <ModalWrapper>
      <View className="flex-1 px-5">
        <Header
          title="Notifications"
          leftIcon={<BackButton />}
          rightIcon={
            items.some((item) => !item.isRead) ? (
              <TouchableOpacity
                accessibilityLabel="Mark all as read"
                onPress={markAllRead}
                hitSlop={10}
              >
                <Checks size={24} color="#a3e635" weight="bold" />
              </TouchableOpacity>
            ) : undefined
          }
          className="mb-[10px]"
        />

        <View className="mb-3 flex-row items-center justify-between">
          <View className="flex-row gap-2">
            <FilterChip label="All" active={!unreadOnly} onPress={() => setFilter(false)} />
            <FilterChip label="Unread" active={unreadOnly} onPress={() => setFilter(true)} />
          </View>
          {!unreadOnly && unreadCount > 0 ? (
            <Typo size={12} color="#a3a3a3">
              {unreadCount} new
            </Typo>
          ) : null}
        </View>

        {loading && items.length === 0 ? (
          <Loading />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={{ paddingBottom: 24, flexGrow: 1 }}
            ListEmptyComponent={
              <EmptyState
                message={unreadOnly ? "You're all caught up" : 'No notifications yet'}
              />
            }
            ListFooterComponent={
              hasMore ? (
                <LoadMoreButton loading={loadingMore} onPress={() => load('more')} />
              ) : null
            }
            renderItem={({ item, index }) => {
              const meta = TYPE_META[item.type] ?? TYPE_META.system
              const Icon = meta.Icon
              const showDaySeparator =
                index === 0 || !isSameCalendarDay(items[index - 1].createdAt, item.createdAt)
              const dayLabel = formatNotificationDayLabel(item.createdAt)

              return (
                <View>
                  {showDaySeparator && dayLabel ? (
                    <View className="mb-2.5 mt-3 flex-row items-center gap-3">
                      <View className="h-px flex-1 bg-neutral-800" />
                      <Typo size={11} color="#737373">{dayLabel}</Typo>
                      <View className="h-px flex-1 bg-neutral-800" />
                    </View>
                  ) : null}
                  <Animated.View
                    entering={FadeInDown.delay(Math.min(index, 8) * 40).springify().damping(40).stiffness(200)}
                    className="mb-2.5"
                  >
                    <Swipeable
                      overshootRight={false}
                      renderRightActions={() => (
                        <View className="mb-0 ml-2 w-[84px]">
                          <TouchableOpacity
                            accessibilityLabel="Delete notification"
                            onPress={() => removeNotification(item)}
                            activeOpacity={0.85}
                            className="flex-1 items-center justify-center rounded-[16px] bg-[#7f1d1d]"
                          >
                            <Typo size={13} fontWeight="700" color="#fecaca">
                              Delete
                            </Typo>
                          </TouchableOpacity>
                        </View>
                      )}
                    >
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => openNotification(item)}
                        className="rounded-[16px] border px-3.5 py-3"
                        style={{
                          backgroundColor: item.isRead ? '#1c1c1c' : '#262626',
                          borderColor: item.isRead ? '#333333' : '#404040',
                        }}
                      >
                        <View className="flex-row items-start gap-3">
                          <View
                            className="mt-0.5 h-10 w-10 items-center justify-center rounded-2xl"
                            style={{ backgroundColor: meta.bg }}
                          >
                            <Icon size={18} color={meta.color} weight="fill" />
                          </View>
                          <View className="min-w-0 flex-1">
                            <View className="flex-row items-start justify-between gap-2">
                              <Typo fontWeight="600" color="#f5f5f5" className="flex-1" textProps={{ numberOfLines: 2 }}>
                                {item.title}
                              </Typo>
                              <Typo size={11} color="#737373">
                                {formatRelativeTime(item.createdAt)}
                              </Typo>
                            </View>
                            {item.body ? (
                              <Typo size={13} color="#a3a3a3" className="mt-1" textProps={{ numberOfLines: 2 }}>
                                {item.body}
                              </Typo>
                            ) : null}
                            <Typo size={11} color={meta.color} className="mt-1.5">
                              {meta.label}
                            </Typo>
                          </View>
                          {!item.isRead ? (
                            <View className="mt-1.5 h-2.5 w-2.5 rounded-full bg-[#a3e635]" />
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    </Swipeable>
                  </Animated.View>
                </View>
              )
            }}
          />
        )}
      </View>

      <NotificationDetailSheet
        ref={detailSheetRef}
        userId={user?.id}
        onActionComplete={() => load('reset')}
        onDeleted={(id) => {
          const next = itemsRef.current.filter((row) => row.id !== id)
          itemsRef.current = next
          setItems(next)
        }}
      />
    </ModalWrapper>
  )
}

export default NotificationsModal
