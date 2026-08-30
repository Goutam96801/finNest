import type { AppNotification } from '@/lib/services/notifications'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

export const SUBSCRIPTION_REMINDER_CHANNEL = 'subscription-reminders'
export const MONEY_ALERTS_CHANNEL = 'money-alerts'
export const ACTIVITY_CHANNEL = 'activity'

const ACCENT = '#a3e635'
const VIBRATE = [0, 250, 250, 250] as number[]

type OsTypeMeta = {
  channelId: string
  channelName: string
  subtitle: string
}

const TYPE_META: Record<AppNotification['type'], OsTypeMeta> = {
  subscription_due: {
    channelId: ACTIVITY_CHANNEL,
    channelName: 'Activity',
    subtitle: 'Reminder',
  },
  subscription_paid: {
    channelId: ACTIVITY_CHANNEL,
    channelName: 'Activity',
    subtitle: 'Paid',
  },
  system: {
    channelId: ACTIVITY_CHANNEL,
    channelName: 'Activity',
    subtitle: 'Update',
  },
  low_balance: {
    channelId: MONEY_ALERTS_CHANNEL,
    channelName: 'Money alerts',
    subtitle: 'Balance',
  },
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

async function setChannel(id: string, name: string) {
  await Notifications.setNotificationChannelAsync(id, {
    name,
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: VIBRATE,
    lightColor: ACCENT,
    sound: 'default',
  })
}

export async function ensureAndroidNotificationChannels() {
  if (Platform.OS !== 'android') return
  await Promise.all([
    setChannel(SUBSCRIPTION_REMINDER_CHANNEL, 'Subscription reminders'),
    setChannel(MONEY_ALERTS_CHANNEL, 'Money alerts'),
    setChannel(ACTIVITY_CHANNEL, 'Activity'),
  ])
}

export async function ensureOsNotificationPermissions() {
  await ensureAndroidNotificationChannels()

  const current = await Notifications.getPermissionsAsync()
  let status = current.status
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync()
    status = requested.status
  }
  return status === 'granted'
}

/** Scheduled reminder OS toasts already fired — do not present again for the mirror row. */
export function shouldPresentOsNotification(notification: AppNotification) {
  return notification.data?.kind !== 'subscription_reminder'
}

export async function presentOsNotification(notification: AppNotification) {
  try {
    if (!shouldPresentOsNotification(notification)) return

    const granted = await ensureOsNotificationPermissions()
    if (!granted) return

    const meta = TYPE_META[notification.type]
    await Notifications.scheduleNotificationAsync({
      identifier: `finnest-os-${notification.id}`,
      content: {
        title: notification.title,
        body: notification.body ?? undefined,
        subtitle: meta.subtitle,
        color: ACCENT,
        sound: true,
        data: {
          ...(notification.data ?? {}),
          notificationId: notification.id,
          type: notification.type,
        },
        ...(Platform.OS === 'android' ? { channelId: meta.channelId } : {}),
      },
      trigger: null,
    })
  } catch (error) {
    console.log('Failed to present OS notification', error)
  }
}
