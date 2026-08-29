import AppRefreshControl from '@/components/AppRefreshControl'
import HomeCardCarousel from '@/components/HomeCardCarousel'
import ScreenWrapper from '@/components/ScreenWrapper'
import TransactionList from '@/components/TransactionList'
import Typo from '@/components/Typo'
import UpcomingSubscriptions from '@/components/UpcomingSubscriptions'
import { showAlert } from '@/context/alertContext'
import { useAuth } from '@/context/authContext'
import { getAccounts } from '@/lib/services/accounts'
import { getUnreadNotificationCount } from '@/lib/services/notifications'
import {
  getUpcomingSubscriptions,
  markSubscriptionPaid,
  skipSubscription,
  snoozeSubscription,
  Subscription,
} from '@/lib/services/subscriptions'
import {
  AccountTotalsMap,
  getRecentTransactions,
  getTransactionTotals,
  getTransactionTotalsByAccount,
} from '@/lib/services/transactions'
import { Account } from '@/lib/types'
import { TransactionType } from '@/types'
import { verticalScale } from '@/utils/styling'
import { useFocusEffect, useRouter } from 'expo-router'
import { Bell, MagnifyingGlass, Plus } from 'phosphor-react-native'
import React, { useCallback, useMemo, useRef, useState } from 'react'
import { ScrollView, TouchableOpacity, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'

const Home = () => {
  const { user } = useAuth()
  const router = useRouter()
  const hasLoadedOnce = useRef(false)
  const [totalBalance, setTotalBalance] = useState(0)
  const [income, setIncome] = useState(0)
  const [expense, setExpense] = useState(0)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountTotals, setAccountTotals] = useState<AccountTotalsMap>({})
  const [transactions, setTransactions] = useState<TransactionType[]>([])
  const [upcoming, setUpcoming] = useState<Subscription[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loadingTransactions, setLoadingTransactions] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const firstName = useMemo(() => {
    const fullName =
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      user?.user_metadata?.display_name ||
      user?.email?.split('@')[0] ||
      'there'

    return String(fullName).trim().split(/\s+/)[0]
  }, [user])

  const loadHomeData = useCallback(async () => {
    if (!user?.id) return

    if (!hasLoadedOnce.current) setLoadingTransactions(true)

    try {
      const [accountRows, totals, byAccount, recent, upcomingRows, unread] = await Promise.all([
        getAccounts(user.id),
        getTransactionTotals(user.id),
        getTransactionTotalsByAccount(user.id),
        getRecentTransactions(user.id, 10),
        getUpcomingSubscriptions(user.id, 21),
        getUnreadNotificationCount(user.id),
      ])

      const sum = accountRows.reduce((total, account) => total + Number(account.balance ?? 0), 0)
      setAccounts(accountRows)
      setTotalBalance(sum)
      setIncome(totals.income)
      setExpense(totals.expense)
      setAccountTotals(byAccount)
      setTransactions(recent)
      setUpcoming(upcomingRows)
      setUnreadCount(unread)
      hasLoadedOnce.current = true
    } catch (error) {
      console.log('Failed to load home data', error)
    } finally {
      setLoadingTransactions(false)
    }
  }, [user?.id])

  useFocusEffect(
    useCallback(() => {
      loadHomeData()
    }, [loadHomeData])
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await loadHomeData()
    } finally {
      setRefreshing(false)
    }
  }, [loadHomeData])

  const handleSubscriptionAction = async (
    action: 'paid' | 'snooze' | 'skip',
    subscriptionId: string
  ) => {
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
      loadHomeData()
    } catch (error: any) {
      showAlert('Unable to update', error?.message ?? 'Please try again.')
    }
  }

  return (
    <ScreenWrapper style={{ backgroundColor: '#000' }}>
      <View className="flex-1 px-5">
        <Animated.View
          entering={FadeInDown.delay(0).springify().damping(40).stiffness(200)}
          className="mb-5 flex-row items-center justify-between"
        >
          <Typo size={24} fontWeight="600" color="#f5f5f5">
            Hello, {firstName}
          </Typo>

          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              hitSlop={12}
              activeOpacity={0.7}
              onPress={() => router.push('/(modals)/notificationsModal')}
              className="h-11 w-11 items-center justify-center rounded-full bg-[#262626]"
            >
              <Bell size={verticalScale(22)} color="#f5f5f5" weight="bold" />
              {unreadCount > 0 ? (
                <View className="absolute -right-0.5 -top-0.5 min-h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[#a3e635] px-1">
                  <Typo size={10} fontWeight="700" color="#171717">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Typo>
                </View>
              ) : null}
            </TouchableOpacity>

            <TouchableOpacity
              hitSlop={12}
              activeOpacity={0.7}
              onPress={() => router.push('/(modals)/searchModal')}
              className="h-11 w-11 items-center justify-center rounded-full bg-[#262626]"
            >
              <MagnifyingGlass size={verticalScale(22)} color="#f5f5f5" weight="bold" />
            </TouchableOpacity>
          </View>
        </Animated.View>

        <View className="relative flex-1">
          <ScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 88 }}
            refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          >
            <Animated.View entering={FadeInDown.delay(50).springify().damping(40).stiffness(200)}>
              <HomeCardCarousel
                totalBalance={totalBalance}
                income={income}
                expense={expense}
                accounts={accounts}
                accountTotals={accountTotals}
              />
            </Animated.View>

            <Animated.View
              entering={FadeInDown.delay(100).springify().damping(40).stiffness(200)}
              style={{ flexGrow: 0, flexShrink: 0 }}
            >
              <UpcomingSubscriptions
                items={upcoming}
                onViewAllPress={() => router.push('/subscriptions')}
                onAddPress={() => router.push('/(modals)/subscriptionModal')}
                onPaid={(id) => handleSubscriptionAction('paid', id)}
                onSnooze={(id) => handleSubscriptionAction('snooze', id)}
                onSkip={(id) => handleSubscriptionAction('skip', id)}
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(150).springify().damping(40).stiffness(200)}>
              <TransactionList
                data={transactions}
                loading={loadingTransactions && transactions.length === 0}
                scrollEnabled={false}
                onViewAllPress={() => router.push('/transactions')}
                onItemPress={(item) =>
                  router.push({
                    pathname: '/(modals)/transactionModal',
                    params: { id: item.id },
                  })
                }
              />
            </Animated.View>
          </ScrollView>

          <TouchableOpacity
            onPress={() => router.push('/(modals)/transactionModal')}
            activeOpacity={0.85}
            className="absolute bottom-10 right-1 h-16 w-16 items-center justify-center rounded-full bg-[#a3e635]"
            style={{ elevation: 4 }}
          >
            <Plus size={verticalScale(30)} color="#000" weight="bold" />
          </TouchableOpacity>
        </View>
      </View>
    </ScreenWrapper>
  )
}

export default Home
