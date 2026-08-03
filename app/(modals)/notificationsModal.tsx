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
  getNotificationsPage,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/services/notifications'
import { useFocusEffect } from 'expo-router'
import { Check } from 'phosphor-react-native'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, TouchableOpacity, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'

const PAGE_SIZE = 20

const NotificationsModal = () => {
  const { user } = useAuth()
  const hasLoadedOnce = useRef(false)
  const requestIdRef = useRef(0)
  const itemsRef = useRef<AppNotification[]>([])
  const loadingMoreRef = useRef(false)
  const hasMoreRef = useRef(false)
  const detailSheetRef = useRef<NotificationDetailSheetHandle>(null)

  const [items, setItems] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => {
    itemsRef.current = items
  }, [items])

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

  const openNotification = async (item: AppNotification) => {
    if (user?.id && !item.isRead) {
      await markNotificationRead(user.id, item.id)
      setItems((prev) =>
        prev.map((row) => (row.id === item.id ? { ...row, isRead: true } : row))
      )
    }
    detailSheetRef.current?.present({ ...item, isRead: true })
  }

  return (
    <ModalWrapper>
      <View className="flex-1 px-5">
        <Header
          title="Notifications"
          leftIcon={<BackButton />}
          rightIcon={
            items.some((item) => !item.isRead) ? (
              <TouchableOpacity
                onPress={async () => {
                  if (!user?.id) return
                  await markAllNotificationsRead(user.id)
                  load('reset')
                }}
                hitSlop={10}
              >
                <Check size={24} color="#a3e635" weight="bold" />
              </TouchableOpacity>
            ) : undefined
          }
          className="mb-[10px]"
        />

        {loading && items.length === 0 ? (
          <Loading />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ gap: 10, paddingBottom: 24, flexGrow: 1 }}
            ListEmptyComponent={<EmptyState message="No notifications yet" />}
            ListFooterComponent={
              hasMore ? (
                <LoadMoreButton loading={loadingMore} onPress={() => load('more')} />
              ) : null
            }
            renderItem={({ item, index }) => (
              <Animated.View
                entering={FadeInDown.delay(index * 50).springify().damping(40).stiffness(200)}
              >
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => openNotification(item)}
                  className="rounded-[16px] border border-[#404040] bg-[#262626] px-4 py-3"
                  style={{ opacity: item.isRead ? 0.7 : 1 }}
                >
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1">
                      <Typo fontWeight="600" color="#f5f5f5">
                        {item.title}
                      </Typo>
                      {item.body ? (
                        <Typo size={13} color="#a3a3a3" className="mt-1">
                          {item.body}
                        </Typo>
                      ) : null}
                    </View>
                    {!item.isRead ? (
                      <View className="mt-1 h-2.5 w-2.5 rounded-full bg-[#a3e635]" />
                    ) : null}
                  </View>
                </TouchableOpacity>
              </Animated.View>
            )}
          />
        )}
      </View>

      <NotificationDetailSheet
        ref={detailSheetRef}
        userId={user?.id}
        onActionComplete={() => load('reset')}
      />
    </ModalWrapper>
  )
}

export default NotificationsModal
