import BackButton from '@/components/BackButton'
import AppRefreshControl from '@/components/AppRefreshControl'
import EmptyState from '@/components/EmptyState'
import Header from '@/components/Header'
import Loading from '@/components/Loading'
import ScreenWrapper from '@/components/ScreenWrapper'
import Typo from '@/components/Typo'
import { showAlert } from '@/context/alertContext'
import { useAuth } from '@/context/authContext'
import {
  getSubscriptions,
  markSubscriptionPaid,
  skipSubscription,
  snoozeSubscription,
  Subscription,
} from '@/lib/services/subscriptions'
import { verticalScale } from '@/utils/styling'
import { useFocusEffect, useRouter } from 'expo-router'
import { Plus, PencilSimple } from 'phosphor-react-native'
import React, { useCallback, useRef, useState } from 'react'
import { FlatList, TouchableOpacity, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'

const formatDue = (value: string) => {
  const date = new Date(`${value}T00:00:00`)
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const SubscriptionsScreen = () => {
  const { user } = useAuth()
  const router = useRouter()
  const hasLoadedOnce = useRef(false)
  const [items, setItems] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!user?.id) return
    if (!hasLoadedOnce.current) setLoading(true)
    try {
      const data = await getSubscriptions(user.id)
      setItems(data)
      hasLoadedOnce.current = true
    } catch (error) {
      console.log('Failed to load subscriptions', error)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load])
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await load()
    } finally {
      setRefreshing(false)
    }
  }, [load])

  const handleAction = async (action: 'paid' | 'snooze' | 'skip', subscriptionId: string) => {
    if (!user?.id) return
    try {
      const response =
        action === 'paid'
          ? await markSubscriptionPaid(user.id, subscriptionId)
          : action === 'snooze'
            ? await snoozeSubscription(user.id, subscriptionId)
            : await skipSubscription(user.id, subscriptionId)

      if (!response.success) throw new Error(response.msg)
      showAlert('Done', response.msg || 'Updated')
      load()
    } catch (error: any) {
      showAlert('Unable to update', error?.message ?? 'Please try again.')
    }
  }

  const openActions = (item: Subscription) => {
    showAlert(
      item.name,
      `Due ${formatDue(item.nextDueDate)} · ₹${Number(item.amount).toLocaleString('en-IN')}`,
      [
        {
          text: 'Mark Paid',
          style: 'primary',
          onPress: () => handleAction('paid', item.id),
        },
        {
          text: 'Snooze 3 days',
          onPress: () => handleAction('snooze', item.id),
        },
        {
          text: 'Skip',
          style: 'destructive',
          onPress: () => handleAction('skip', item.id),
        },
      ],
      {
        onTitleAction: () =>
          router.push({
            pathname: '/(modals)/subscriptionModal',
            params: { id: item.id },
          }),
      }
    )
  }

  return (
    <ScreenWrapper style={{ backgroundColor: '#000' }}>
      <View className="flex-1 px-5">
        <Header
          title="Subscriptions"
          leftIcon={<BackButton />}
          rightIcon={
            <TouchableOpacity
              onPress={() => router.push('/(modals)/subscriptionModal')}
              hitSlop={10}
            >
              <Plus size={verticalScale(24)} color="#a3e635" weight="bold" />
            </TouchableOpacity>
          }
          className="mb-4"
        />

        {loading && items.length === 0 ? (
          <Loading />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={{ gap: 12, paddingBottom: 32, flexGrow: 1 }}
            ListEmptyComponent={<EmptyState message="No subscriptions yet" />}
            renderItem={({ item, index }) => (
              <Animated.View
                entering={FadeInDown.delay(index * 50).springify().damping(40).stiffness(200)}
              >
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => openActions(item)}
                  className="rounded-2xl border border-[#404040] bg-[#262626] px-4 py-4"
                >
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="min-w-0 flex-1">
                      <View className="flex-row items-center gap-2">
                        <Typo fontWeight="600" color="#f5f5f5" className="shrink">
                          {item.name}
                        </Typo>
                        <TouchableOpacity
                          onPress={() =>
                            router.push({
                              pathname: '/(modals)/subscriptionModal',
                              params: { id: item.id },
                            })
                          }
                          hitSlop={10}
                          activeOpacity={0.7}
                        >
                          <PencilSimple size={16} color="#a3e635" weight="bold" />
                        </TouchableOpacity>
                      </View>
                      <Typo size={13} color="#a3a3a3" className="mt-1">
                        Due {formatDue(item.nextDueDate)} · {item.frequency}
                      </Typo>
                      {item.notes ? (
                        <Typo size={12} color="#737373" className="mt-1">
                          {item.notes}
                        </Typo>
                      ) : null}
                    </View>
                    <Typo size={18} fontWeight="700" color="#a3e635">
                      ₹{Number(item.amount).toLocaleString('en-IN')}
                    </Typo>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            )}
          />
        )}
      </View>
    </ScreenWrapper>
  )
}

export default SubscriptionsScreen
