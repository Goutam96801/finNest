import AccountListItem from '@/components/AccountListItem'
import AppRefreshControl from '@/components/AppRefreshControl'
import EmptyState from '@/components/EmptyState'
import Loading from '@/components/Loading'
import ScreenWrapper from '@/components/ScreenWrapper'
import Typo from '@/components/Typo'
import { useAuth } from '@/context/authContext'
import { getAccounts } from '@/lib/services/accounts'
import { Account } from '@/lib/types'
import { verticalScale } from '@/utils/styling'
import { useFocusEffect, useRouter } from 'expo-router'
import * as Icons from 'phosphor-react-native'
import React, { useCallback, useRef, useState } from 'react'
import { FlatList, TouchableOpacity, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'

const Accounts = () => {
  const router = useRouter()
  const { user } = useAuth()
  const hasLoadedOnce = useRef(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadAccounts = useCallback(async () => {
    if (!user?.id) return

    if (!hasLoadedOnce.current) setLoading(true)
    try {
      const data = await getAccounts(user.id)
      setAccounts(data || [])
      hasLoadedOnce.current = true
    } catch (error) {
      console.log('Failed to load accounts', error)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useFocusEffect(
    useCallback(() => {
      loadAccounts()
    }, [loadAccounts])
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await loadAccounts()
    } finally {
      setRefreshing(false)
    }
  }, [loadAccounts])

  const totalBalance = accounts.reduce((sum, account) => sum + Number(account.balance ?? 0), 0)

  return (
    <ScreenWrapper style={{ backgroundColor: '#000' }}>
      <View className="flex-1 justify-between">
        <View className="h-40 bg-[#000] justify-center items-center">
          <View className="items-center">
            <Typo size={45} fontWeight="500">
              ₹{totalBalance.toFixed(2)}
            </Typo>
            <Typo size={16} color="#d4d4d4">
              Total Balance
            </Typo>
          </View>
        </View>

        <View
          style={{
            flex: 1,
            backgroundColor: '#171717',
            padding: 20,
            paddingTop: 25,
            borderTopLeftRadius: 30,
            borderTopRightRadius: 30,
          }}
        >
          <View className="mb-[10px] flex-row items-center justify-between">
            <Typo size={20} fontWeight="500">
              My Accounts
            </Typo>
            <TouchableOpacity onPress={() => router.push('/(modals)/accountModal')}>
              <Icons.PlusCircle weight="fill" color="#a3e635" size={verticalScale(33)} />
            </TouchableOpacity>
          </View>

          {loading && accounts.length === 0 ? (
            <Loading />
          ) : (
            <FlatList
              data={accounts}
              keyExtractor={(item) => item.id ?? `${item.name}-${item.createdAt}`}
              showsVerticalScrollIndicator={false}
              refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              contentContainerStyle={{ gap: 12, paddingBottom: 20, flexGrow: 1 }}
              renderItem={({ item, index }) => (
                <Animated.View
                  entering={FadeInDown.delay(index * 50).springify().damping(40).stiffness(200)}
                >
                  <AccountListItem
                    account={item}
                    color={item.color}
                    icon={item.icon}
                    onPress={() =>
                      router.push({
                        pathname: '/(modals)/accountModal',
                        params: { id: item.id },
                      })
                    }
                  />
                </Animated.View>
              )}
              ListEmptyComponent={<EmptyState message="No accounts yet" />}
            />
          )}
        </View>
      </View>
    </ScreenWrapper>
  )
}

export default Accounts
