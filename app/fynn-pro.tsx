import AppRefreshControl from '@/components/AppRefreshControl'
import BackButton from '@/components/BackButton'
import Header from '@/components/Header'
import ScreenWrapper from '@/components/ScreenWrapper'
import Typo from '@/components/Typo'
import { showAlert } from '@/context/alertContext'
import { useAuth } from '@/context/authContext'
import { useFynnPro } from '@/context/fynnProContext'
import {
  listFynnPurchases,
  openFynnCheckout,
  type FynnPlanId,
  type FynnPurchase,
} from '@/lib/services/fynnPro'
import { Crown } from 'phosphor-react-native'
import React, { useCallback, useState } from 'react'
import { Platform, ScrollView, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import Animated, { FadeInDown } from 'react-native-reanimated'

function formatRupees(paise: number) {
  return `₹${Math.round(paise / 100)}`
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function planLabel(plan: FynnPlanId) {
  return plan === 'yearly' ? 'Yearly' : 'Monthly'
}

function statusLabel(status: FynnPurchase['status']) {
  if (status === 'paid') return 'Paid'
  if (status === 'failed') return 'Failed'
  return 'Pending'
}

export default function FynnProScreen() {
  const { user } = useAuth()
  const { status, refresh } = useFynnPro()
  const [purchases, setPurchases] = useState<FynnPurchase[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [buying, setBuying] = useState<FynnPlanId | null>(null)

  const load = useCallback(async () => {
    try {
      const [nextPurchases] = await Promise.all([listFynnPurchases(), refresh()])
      setPurchases(nextPurchases)
    } catch (e) {
      showAlert('Could not load Fynn Pro', e instanceof Error ? e.message : 'Try again.')
    }
  }, [refresh])

  useFocusEffect(useCallback(() => {
    void load()
  }, [load]))

  const onRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  const buy = async (plan: FynnPlanId) => {
    if (Platform.OS !== 'android') {
      showAlert('Android only', 'Fynn Pro checkout is available on Android for now.')
      return
    }
    setBuying(plan)
    try {
      const result = await openFynnCheckout(plan, {
        email: user?.email,
        name: user?.user_metadata?.display_name,
      })
      await load()
      if (result === 'paid') {
        showAlert('Fynn Pro is active', 'You can chat with Fynn now.')
      } else if (result === 'pending') {
        showAlert('Still confirming', 'Payment was received. Pull to refresh if Fynn is still locked.')
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Checkout failed'
      if (!/cancel/i.test(message)) showAlert('Payment failed', message)
    } finally {
      setBuying(null)
    }
  }

  const subscribed = status?.subscribed === true
  const used = status?.used ?? 0
  const limit = status?.limit ?? 20
  const currentPlan = status?.plan ? planLabel(status.plan) : 'Free'

  return (
    <ScreenWrapper>
      <View className="flex-1 px-5">
        <Header title="Fynn Pro" leftIcon={<BackButton />} className="my-[10px]" />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <Animated.View entering={FadeInDown.delay(20).springify().damping(40).stiffness(200)}>
            <View className="mt-3 rounded-2xl border border-[#404040] bg-[#171717] px-4 py-4">
              <View className="flex-row items-center gap-3">
                <View className="h-11 w-11 items-center justify-center rounded-2xl bg-lime-400/20">
                  <Crown size={22} color="#a3e635" weight="fill" />
                </View>
                <View className="flex-1">
                  <Typo size={13} className="text-neutral-400">Current plan</Typo>
                  <Typo size={18} fontWeight="600" className="text-neutral-100">{currentPlan}</Typo>
                </View>
              </View>
              {subscribed ? (
                <Typo size={13} className="mt-3 text-neutral-400">
                  Active until {formatDate(status?.periodEnd ?? null)}
                </Typo>
              ) : (
                <Typo size={13} className="mt-3 text-neutral-400">
                  Subscribe to unlock Fynn chat.
                </Typo>
              )}
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(60).springify().damping(40).stiffness(200)}>
            <View className={`mt-4 rounded-2xl border border-[#404040] bg-[#171717] px-4 py-4 ${subscribed ? '' : 'opacity-50'}`}>
              <Typo size={13} className="text-neutral-400">{`Today's AI usage`}</Typo>
              <Typo size={22} fontWeight="600" className="mt-1 text-neutral-100">
                {subscribed ? `${used} / ${limit}` : `0 / ${limit}`}
              </Typo>
              <Typo size={12} className="mt-1 text-neutral-500">Resets at midnight IST</Typo>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(100).springify().damping(40).stiffness(200)} className="mt-5 gap-3">
            <Typo size={14} fontWeight="600" className="text-neutral-300">Plans</Typo>
            <PlanCard
              title="Monthly"
              price="₹99"
              detail="30 days · 20 messages / day"
              cta={subscribed ? 'Extend' : 'Buy'}
              loading={buying === 'monthly'}
              disabled={buying !== null}
              onPress={() => buy('monthly')}
            />
            <PlanCard
              title="Yearly"
              price="₹999"
              detail="365 days · 20 messages / day · save vs ₹1,188"
              cta={subscribed ? 'Extend' : 'Buy'}
              loading={buying === 'yearly'}
              disabled={buying !== null}
              onPress={() => buy('yearly')}
            />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(140).springify().damping(40).stiffness(200)} className="mt-7">
            <Typo size={14} fontWeight="600" className="mb-3 text-neutral-300">Previous purchases</Typo>
            {purchases.length === 0 ? (
              <Typo size={13} className="text-neutral-500">No purchases yet.</Typo>
            ) : purchases.map((purchase) => (
              <View
                key={purchase.id}
                className={`mb-2.5 rounded-2xl border border-[#404040] bg-[#171717] px-4 py-3 ${purchase.status !== 'paid' ? 'opacity-60' : ''}`}
              >
                <View className="flex-row items-center justify-between">
                  <Typo size={15} fontWeight="600" className="text-neutral-100">
                    {planLabel(purchase.plan)} · {formatRupees(purchase.amountPaise)}
                  </Typo>
                  <Typo size={12} className={purchase.status === 'paid' ? 'text-lime-400' : 'text-neutral-500'}>
                    {statusLabel(purchase.status)}
                  </Typo>
                </View>
                <Typo size={12} className="mt-1 text-neutral-500">
                  {formatDate(purchase.createdAt)}
                  {purchase.status === 'paid' && purchase.periodEnd
                    ? ` · until ${formatDate(purchase.periodEnd)}`
                    : ''}
                </Typo>
              </View>
            ))}
          </Animated.View>
        </ScrollView>
      </View>
    </ScreenWrapper>
  )
}

function PlanCard({
  title,
  price,
  detail,
  cta,
  loading,
  disabled,
  onPress,
}: {
  title: string
  price: string
  detail: string
  cta: string
  loading: boolean
  disabled: boolean
  onPress: () => void
}) {
  return (
    <View className="rounded-2xl border border-[#404040] bg-[#171717] px-4 py-4">
      <View className="flex-row items-end justify-between">
        <View className="flex-1 pr-3">
          <Typo size={16} fontWeight="600" className="text-neutral-100">{title}</Typo>
          <Typo size={12} className="mt-1 text-neutral-500">{detail}</Typo>
        </View>
        <Typo size={22} fontWeight="700" className="text-lime-400">{price}</Typo>
      </View>
      <TouchableOpacity
        disabled={disabled}
        onPress={onPress}
        className={`mt-3.5 h-[46px] items-center justify-center rounded-2xl ${disabled && !loading ? 'bg-neutral-700' : 'bg-lime-400'}`}
      >
        <Typo size={15} fontWeight="600" className="text-neutral-900">
          {loading ? 'Processing…' : cta}
        </Typo>
      </TouchableOpacity>
    </View>
  )
}
