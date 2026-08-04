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
import { Bell, MagnifyingGlass } from 'phosphor-react-native'
import React, { useCallback, useMemo, useRef, useState } from 'react'
import { TouchableOpacity, View } from 'react-native'
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
                <View className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[#a3e635]" />
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

        <Animated.View
          entering={FadeInDown.delay(150).springify().damping(40).stiffness(200)}
          className="flex-1"
        >
          <TransactionList
            data={transactions}
            loading={loadingTransactions && transactions.length === 0}
            onAddPress={() => router.push('/(modals)/transactionModal')}
            onViewAllPress={() => router.push('/transactions')}
            onItemPress={(item) =>
              router.push({
                pathname: '/(modals)/transactionModal',
                params: { id: item.id },
              })
            }
          />
        </Animated.View>
      </View>
    </ScreenWrapper>
  )
}

export default Home
