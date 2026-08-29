import { useAuth } from '@/context/authContext'
import {
  ensureInAppReminderNotification,
  parseReminderData,
  resyncSubscriptionRemindersForUser,
} from '@/lib/services/localReminders'
import { router } from 'expo-router'
import * as Notifications from 'expo-notifications'
import React, { PropsWithChildren, useEffect, useRef } from 'react'
import { AppState, type AppStateStatus } from 'react-native'

/**
 * Keeps local subscription reminder schedules in sync and mirrors fired
 * reminders into the in-app notifications list.
 */
export function SubscriptionRemindersProvider({ children }: PropsWithChildren) {
  const { user, loading } = useAuth()
  const userId = user?.id
  const syncing = useRef(false)

  const sync = async (id: string) => {
    if (syncing.current) return
    syncing.current = true
    try {
      await resyncSubscriptionRemindersForUser(id)
    } finally {
      syncing.current = false
    }
  }

  useEffect(() => {
    if (loading || !userId) return
    void sync(userId)
  }, [loading, userId])

  useEffect(() => {
    if (!userId) return

    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') void sync(userId)
    }
    const sub = AppState.addEventListener('change', onAppState)
    return () => sub.remove()
  }, [userId])

  useEffect(() => {
    if (!userId) return

    const mirror = async (data: Record<string, unknown> | undefined) => {
      const parsed = parseReminderData(data)
      if (!parsed) return
      await ensureInAppReminderNotification(userId, parsed)
    }

    const received = Notifications.addNotificationReceivedListener((notification) => {
      void mirror(notification.request.content.data as Record<string, unknown>)
    })

    const response = Notifications.addNotificationResponseReceivedListener((event) => {
      void mirror(event.notification.request.content.data as Record<string, unknown>)
      try {
        router.push('/(modals)/notificationsModal')
      } catch {
        // Navigation may not be ready yet (cold start) — in-app row still lands.
      }
    })

    void Notifications.getLastNotificationResponseAsync().then((last) => {
      if (!last) return
      void mirror(last.notification.request.content.data as Record<string, unknown>)
    })

    return () => {
      received.remove()
      response.remove()
    }
  }, [userId])

  return <>{children}</>
}
