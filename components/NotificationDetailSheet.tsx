import Typo from '@/components/Typo'
import { showAlert } from '@/context/alertContext'
import {
  deleteNotification,
  formatRelativeTime,
  type AppNotification,
} from '@/lib/services/notifications'
import {
  getSubscriptionById,
  markSubscriptionPaid,
  skipSubscription,
  snoozeSubscription,
  type Subscription,
} from '@/lib/services/subscriptions'
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet'
import { useRouter } from 'expo-router'
import { PencilSimple, Trash } from 'phosphor-react-native'
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { ActivityIndicator, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export type NotificationDetailSheetHandle = {
  present: (notification: AppNotification) => void
  dismiss: () => void
}

type NotificationDetailSheetProps = {
  userId?: string
  onActionComplete?: () => void
  onDeleted?: (notificationId: string) => void
}

const formatDue = (value: string) => {
  const date = new Date(`${value}T00:00:00`)
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const TYPE_LABEL: Record<AppNotification['type'], string> = {
  subscription_due: 'Reminder',
  subscription_paid: 'Paid',
  low_balance: 'Low balance',
  system: 'Update',
}

const ActionButton = ({
  label,
  onPress,
  disabled,
  variant = 'neutral',
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  variant?: 'primary' | 'neutral' | 'destructive'
}) => {
  const bg =
    variant === 'primary' ? '#a3e635' : variant === 'destructive' ? '#7f1d1d' : '#262626'
  const color = variant === 'primary' ? '#000' : '#f5f5f5'
  const border = variant === 'neutral' ? '#404040' : 'transparent'

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      className="items-center justify-center rounded-2xl py-3.5"
      style={{ backgroundColor: bg, borderWidth: 1, borderColor: border, opacity: disabled ? 0.6 : 1 }}
    >
      <Typo fontWeight="700" color={color}>
        {label}
      </Typo>
    </TouchableOpacity>
  )
}

function subscriptionIdFrom(item: AppNotification | null) {
  const id = item?.data?.subscriptionId
  return typeof id === 'string' ? id : null
}

const NotificationDetailSheet = forwardRef<
  NotificationDetailSheetHandle,
  NotificationDetailSheetProps
>(({ userId, onActionComplete, onDeleted }, ref) => {
  const sheetRef = useRef<BottomSheetModal>(null)
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const snapPoints = useMemo(() => ['48%', '68%'], [])

  const [notification, setNotification] = useState<AppNotification | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loadingSub, setLoadingSub] = useState(false)
  const [acting, setActing] = useState(false)

  const subscriptionId = subscriptionIdFrom(notification)
  const canActOnSubscription = notification?.type === 'subscription_due' && !!subscriptionId

  useImperativeHandle(ref, () => ({
    present: (item: AppNotification) => {
      setNotification(item)
      setSubscription(null)
      sheetRef.current?.present()

      const id = subscriptionIdFrom(item)
      if (!userId || !id) return

      setLoadingSub(true)
      getSubscriptionById(userId, id)
        .then((sub) => setSubscription(sub))
        .catch((error) => console.log('Failed to load subscription', error))
        .finally(() => setLoadingSub(false))
    },
    dismiss: () => sheetRef.current?.dismiss(),
  }))

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.6}
      />
    ),
    []
  )

  const openRouteAfterDismiss = (href: Parameters<typeof router.push>[0]) => {
    sheetRef.current?.dismiss()
    setTimeout(() => router.push(href), 10)
  }

  const handleAction = async (action: 'paid' | 'snooze' | 'skip') => {
    if (!userId || !subscriptionId || acting) return
    setActing(true)
    try {
      const response =
        action === 'paid'
          ? await markSubscriptionPaid(userId, subscriptionId)
          : action === 'snooze'
            ? await snoozeSubscription(userId, subscriptionId)
            : await skipSubscription(userId, subscriptionId)

      if (!response.success) throw new Error(response.msg)
      sheetRef.current?.dismiss()
      showAlert('Done', response.msg || 'Updated')
      onActionComplete?.()
    } catch (error: any) {
      showAlert('Unable to update', error?.message ?? 'Please try again.')
    } finally {
      setActing(false)
    }
  }

  const handleDelete = async () => {
    if (!userId || !notification || acting) return
    setActing(true)
    try {
      const response = await deleteNotification(userId, notification.id)
      if (!response.success) throw new Error(response.msg)
      const id = notification.id
      sheetRef.current?.dismiss()
      onDeleted?.(id)
    } catch (error: any) {
      showAlert('Unable to delete', error?.message ?? 'Please try again.')
    } finally {
      setActing(false)
    }
  }

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: '#171717' }}
      handleIndicatorStyle={{ backgroundColor: '#737373' }}
    >
      <BottomSheetScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: Math.max(insets.bottom, 20),
        }}
      >
        {notification ? (
          <Typo size={11} fontWeight="600" color="#a3a3a3" className="mb-2">
            {TYPE_LABEL[notification.type]}
            {notification.createdAt ? ` · ${formatRelativeTime(notification.createdAt)}` : ''}
          </Typo>
        ) : null}

        {subscriptionId && subscription ? (
          <>
            <View className="flex-row items-center gap-2">
              <Typo size={18} fontWeight="600" color="#f5f5f5" className="shrink">
                {subscription.name}
              </Typo>
              <TouchableOpacity
                onPress={() =>
                  openRouteAfterDismiss({
                    pathname: '/(modals)/subscriptionModal',
                    params: { id: subscription.id },
                  })
                }
                hitSlop={10}
                activeOpacity={0.7}
              >
                <PencilSimple size={18} color="#a3e635" weight="bold" />
              </TouchableOpacity>
            </View>
            <Typo size={14} color="#a3a3a3" className="mt-3">
              Due {formatDue(subscription.nextDueDate)} · ₹
              {Number(subscription.amount).toLocaleString('en-IN')}
            </Typo>
            {subscription.notes ? (
              <Typo size={13} color="#a3a3a3" className="mt-2">
                {subscription.notes}
              </Typo>
            ) : null}
            {notification?.body && notification.type !== 'subscription_due' ? (
              <Typo size={13} color="#a3a3a3" className="mt-2">
                {notification.body}
              </Typo>
            ) : null}
          </>
        ) : (
          <>
            <Typo size={18} fontWeight="600" color="#f5f5f5">
              {notification?.title || 'Notification'}
            </Typo>
            {loadingSub && subscriptionId ? (
              <View className="mt-5 items-center py-2">
                <ActivityIndicator color="#a3e635" />
              </View>
            ) : notification?.body ? (
              <Typo size={14} color="#a3a3a3" className="mt-3">
                {notification.body}
              </Typo>
            ) : null}
            {subscriptionId && !loadingSub && !subscription ? (
              <Typo size={13} color="#a3a3a3" className="mt-3">
                Subscription details unavailable
              </Typo>
            ) : null}
          </>
        )}

        {canActOnSubscription ? (
          <View className="mt-5 gap-2.5">
            <ActionButton
              label="Mark paid"
              variant="primary"
              disabled={acting || loadingSub || !subscription}
              onPress={() => handleAction('paid')}
            />
            <ActionButton
              label="Snooze 3 days"
              variant="neutral"
              disabled={acting || loadingSub || !subscription}
              onPress={() => handleAction('snooze')}
            />
            <ActionButton
              label="Skip"
              variant="destructive"
              disabled={acting || loadingSub || !subscription}
              onPress={() => handleAction('skip')}
            />
          </View>
        ) : null}

        {notification?.type === 'low_balance' ? (
          <View className="mt-5">
            <ActionButton
              label="View accounts"
              variant="primary"
              onPress={() => openRouteAfterDismiss('/(tabs)/accounts')}
            />
          </View>
        ) : null}

        {notification?.type === 'subscription_paid' && subscriptionId ? (
          <View className="mt-5">
            <ActionButton
              label="View subscription"
              variant="neutral"
              onPress={() =>
                openRouteAfterDismiss({
                  pathname: '/(modals)/subscriptionModal',
                  params: { id: subscriptionId },
                })
              }
            />
          </View>
        ) : null}

        <TouchableOpacity
          onPress={handleDelete}
          disabled={acting || !notification}
          activeOpacity={0.85}
          className="mt-4 flex-row items-center justify-center gap-2 py-3"
          style={{ opacity: acting ? 0.6 : 1 }}
        >
          <Trash size={16} color="#f87171" weight="bold" />
          <Typo size={13} fontWeight="600" color="#f87171">
            Delete notification
          </Typo>
        </TouchableOpacity>
      </BottomSheetScrollView>
    </BottomSheetModal>
  )
})

NotificationDetailSheet.displayName = 'NotificationDetailSheet'

export default NotificationDetailSheet
