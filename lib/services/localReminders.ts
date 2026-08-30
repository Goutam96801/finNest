import {
  createNotification,
  getNotifications,
  type AppNotification,
} from '@/lib/services/notifications'
import {
  ensureOsNotificationPermissions,
  SUBSCRIPTION_REMINDER_CHANNEL,
} from '@/lib/services/osNotifications'
import { getNotificationSettings } from '@/lib/services/settings'
import {
  getSubscriptions,
  type Subscription,
} from '@/lib/services/subscriptions'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

export { SUBSCRIPTION_REMINDER_CHANNEL }
const ID_PREFIX = 'finnest-sub-'
const REMINDER_HOUR = 9

export type ReminderKind = 'day_before' | 'due_day'

type ReminderData = {
  kind: 'subscription_reminder'
  subscriptionId: string
  reminder: ReminderKind
  date: string
  name: string
  amount: number
}

function todayLocalStr() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDaysToDateStr(dateStr: string, days: number) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  const yy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** 09:00 local on the given YYYY-MM-DD */
function atLocalNine(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d, REMINDER_HOUR, 0, 0, 0)
}

function reminderIdentifier(subscriptionId: string, reminder: ReminderKind) {
  return `${ID_PREFIX}${subscriptionId}-${reminder}`
}

export async function ensureNotificationPermissions() {
  return ensureOsNotificationPermissions()
}

async function cancelFinNestSubscriptionSchedules() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync()
  await Promise.all(
    scheduled
      .filter((item) => item.identifier.startsWith(ID_PREFIX))
      .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier))
  )
}

function reminderCopy(sub: Subscription, reminder: ReminderKind) {
  const amount = `₹${Number(sub.amount).toLocaleString('en-IN')}`
  if (reminder === 'day_before') {
    return {
      title: `${sub.name} due tomorrow`,
      body: `${amount} · Due ${sub.nextDueDate}`,
    }
  }
  return {
    title: `${sub.name} is due today`,
    body: `${amount} · Pay or snooze in FinNest`,
  }
}

async function scheduleOne(
  sub: Subscription,
  reminder: ReminderKind,
  fireDateStr: string
) {
  const when = atLocalNine(fireDateStr)
  if (when.getTime() <= Date.now()) return

  const copy = reminderCopy(sub, reminder)
  const data: ReminderData = {
    kind: 'subscription_reminder',
    subscriptionId: sub.id,
    reminder,
    date: fireDateStr,
    name: sub.name,
    amount: sub.amount,
  }

  await Notifications.scheduleNotificationAsync({
    identifier: reminderIdentifier(sub.id, reminder),
    content: {
      title: copy.title,
      body: copy.body,
      subtitle: 'Reminder',
      color: '#a3e635',
      data,
      sound: true,
      ...(Platform.OS === 'android' ? { channelId: SUBSCRIPTION_REMINDER_CHANNEL } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: when,
      ...(Platform.OS === 'android' ? { channelId: SUBSCRIPTION_REMINDER_CHANNEL } : {}),
    },
  })
}

export async function syncSubscriptionReminders(
  _userId: string,
  subscriptions: Subscription[],
  enabled: boolean
) {
  try {
    await cancelFinNestSubscriptionSchedules()
    if (!enabled) return

    const granted = await ensureNotificationPermissions()
    if (!granted) return

    const active = subscriptions.filter((item) => item.isActive)
    for (const sub of active) {
      const dayBefore = addDaysToDateStr(sub.nextDueDate, -1)
      await scheduleOne(sub, 'day_before', dayBefore)
      await scheduleOne(sub, 'due_day', sub.nextDueDate)
    }
  } catch (error) {
    console.log('Failed to sync subscription reminders', error)
  }
}

function matchesReminder(
  item: AppNotification,
  subscriptionId: string,
  reminder: ReminderKind,
  date: string
) {
  const data = item.data ?? {}
  return (
    data.kind === 'subscription_reminder' &&
    data.subscriptionId === subscriptionId &&
    data.reminder === reminder &&
    data.date === date
  )
}

export async function ensureInAppReminderNotification(
  userId: string,
  payload: {
    subscriptionId: string
    reminder: ReminderKind
    date: string
    name: string
    amount?: number
  },
  existing?: AppNotification[]
) {
  const rows = existing ?? (await getNotifications(userId))
  const already = rows.some((row) =>
    matchesReminder(row, payload.subscriptionId, payload.reminder, payload.date)
  )
  if (already) return { success: true as const, skipped: true }

  const amount =
    payload.amount != null ? `₹${Number(payload.amount).toLocaleString('en-IN')}` : null
  const title =
    payload.reminder === 'day_before'
      ? `${payload.name} due tomorrow`
      : `${payload.name} is due today`
  const body =
    payload.reminder === 'day_before'
      ? [amount, `Due soon`].filter(Boolean).join(' · ')
      : [amount, 'Pay or snooze in FinNest'].filter(Boolean).join(' · ')

  return createNotification(userId, {
    type: 'subscription_due',
    title,
    body,
    data: {
      kind: 'subscription_reminder',
      subscriptionId: payload.subscriptionId,
      reminder: payload.reminder,
      date: payload.date,
      name: payload.name,
      amount: payload.amount,
    },
  })
}

/** If OS fired overnight while JS was dead, create missing in-app rows on next open. */
export async function reconcileDueInAppNotifications(
  userId: string,
  subscriptions: Subscription[]
) {
  try {
    const now = new Date()
    // Only mirror reminders whose 09:00 trigger should already have passed.
    if (now.getHours() < REMINDER_HOUR) return

    const today = todayLocalStr()
    const tomorrow = addDaysToDateStr(today, 1)
    const existing = await getNotifications(userId)
    const active = subscriptions.filter((item) => item.isActive)

    for (const sub of active) {
      if (sub.nextDueDate === tomorrow) {
        await ensureInAppReminderNotification(
          userId,
          {
            subscriptionId: sub.id,
            reminder: 'day_before',
            date: today,
            name: sub.name,
            amount: sub.amount,
          },
          existing
        )
      }
      if (sub.nextDueDate === today) {
        await ensureInAppReminderNotification(
          userId,
          {
            subscriptionId: sub.id,
            reminder: 'due_day',
            date: today,
            name: sub.name,
            amount: sub.amount,
          },
          existing
        )
      }
    }
  } catch (error) {
    console.log('Failed to reconcile due in-app notifications', error)
  }
}

export async function resyncSubscriptionRemindersForUser(userId: string) {
  if (!userId) return
  try {
    const [settings, subscriptions] = await Promise.all([
      getNotificationSettings(userId),
      getSubscriptions(userId),
    ])
    await syncSubscriptionReminders(
      userId,
      subscriptions,
      settings.subscriptionRemindersEnabled
    )
    if (settings.subscriptionRemindersEnabled) {
      await reconcileDueInAppNotifications(userId, subscriptions)
    }
    const { reconcileLowBalanceAlerts } = await import('@/lib/services/lowBalanceAlerts')
    await reconcileLowBalanceAlerts(userId)
  } catch (error) {
    console.log('Failed to resync subscription reminders', error)
  }
}

export function parseReminderData(data: Record<string, unknown> | undefined | null) {
  if (!data || data.kind !== 'subscription_reminder') return null
  if (typeof data.subscriptionId !== 'string') return null
  if (data.reminder !== 'day_before' && data.reminder !== 'due_day') return null
  if (typeof data.date !== 'string') return null
  return {
    subscriptionId: data.subscriptionId,
    reminder: data.reminder as ReminderKind,
    date: data.date,
    name: typeof data.name === 'string' ? data.name : 'Subscription',
    amount: typeof data.amount === 'number' ? data.amount : undefined,
  }
}
