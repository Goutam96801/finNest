import BackButton from '@/components/BackButton'
import AppRefreshControl from '@/components/AppRefreshControl'
import BottomSheetSelect, { type BottomSheetSelectHandle } from '@/components/BottomSheetSelect'
import DateRangeBottomSheet, {
  dateRangeChipLabel,
  DateRangeValue,
  resolveDateRangeBounds,
} from '@/components/DateRangeBottomSheet'
import EmptyState from '@/components/EmptyState'
import Header from '@/components/Header'
import Input from '@/components/Input'
import LoadMoreButton from '@/components/LoadMoreButton'
import Loading from '@/components/Loading'
import ScreenWrapper from '@/components/ScreenWrapper'
import { TransactionRow } from '@/components/TransactionList'
import Typo from '@/components/Typo'
import { useAuth } from '@/context/authContext'
import { usePrefs } from '@/context/prefsContext'
import { getAccounts } from '@/lib/services/accounts'
import { getTransactionsPage } from '@/lib/services/transactions'
import { Account } from '@/lib/types'
import { TransactionType } from '@/types'
import { verticalScale } from '@/utils/styling'
import { useFocusEffect, useRouter } from 'expo-router'
import { CaretDown, MagnifyingGlass, Plus } from 'phosphor-react-native'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FlatList, TouchableOpacity, View } from 'react-native'

type FilterType = 'all' | 'expense' | 'income' | 'transfer'

const PAGE_SIZE = 20

const TYPE_OPTIONS: { label: string; value: FilterType }[] = [
  { label: 'All types', value: 'all' },
  { label: 'Expense', value: 'expense' },
  { label: 'Income', value: 'income' },
  { label: 'Transfer', value: 'transfer' },
]

const FilterChip = ({
  label,
  active,
  onPress,
}: {
  label: string
  active?: boolean
  onPress: () => void
}) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.85}
    className="min-w-0 flex-1 flex-row items-center justify-center gap-1 rounded-xl border px-2 py-2.5"
    style={{
      backgroundColor: active ? '#262626' : '#171717',
      borderColor: active ? '#a3e635' : '#404040',
    }}
  >
    <Typo
      size={12}
      fontWeight="600"
      color={active ? '#a3e635' : '#e5e5e5'}
      textProps={{ numberOfLines: 1 }}
    >
      {label}
    </Typo>
    <CaretDown size={12} color={active ? '#a3e635' : '#a3a3a3'} weight="bold" />
  </TouchableOpacity>
)

const TransactionsScreen = () => {
  const { user } = useAuth()
  const { weekStartsOn } = usePrefs()
  const router = useRouter()
  const hasLoadedOnce = useRef(false)
  const typeSheetRef = useRef<BottomSheetSelectHandle>(null)
  const accountSheetRef = useRef<BottomSheetSelectHandle>(null)
  const dateSheetRef = useRef<BottomSheetSelectHandle>(null)
  const requestIdRef = useRef(0)
  const itemsRef = useRef<TransactionType[]>([])
  const loadingMoreRef = useRef(false)
  const hasMoreRef = useRef(false)

  const [items, setItems] = useState<TransactionType[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<FilterType>('all')
  const [accountId, setAccountId] = useState('')
  const [dateRange, setDateRange] = useState<DateRangeValue>({ preset: 'all' })

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

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
        const bounds = resolveDateRangeBounds(dateRange, weekStartsOn)
        const offset = mode === 'more' ? itemsRef.current.length : 0

        const [page, accountRows] = await Promise.all([
          getTransactionsPage(user.id, {
            limit: PAGE_SIZE,
            offset,
            type: typeFilter === 'all' ? undefined : typeFilter,
            accountId: accountId || undefined,
            from: bounds.from ? bounds.from.toISOString() : undefined,
            to: bounds.to ? bounds.to.toISOString() : undefined,
            search: debouncedSearch || undefined,
          }),
          mode === 'reset' ? getAccounts(user.id) : Promise.resolve(null),
        ])

        if (requestId !== requestIdRef.current) return

        const nextItems = mode === 'more' ? [...itemsRef.current, ...page.items] : page.items
        itemsRef.current = nextItems
        hasMoreRef.current = page.hasMore
        setItems(nextItems)
        setHasMore(page.hasMore)
        if (mode === 'reset' && accountRows) {
          setAccounts(accountRows)
          hasLoadedOnce.current = true
        }
      } catch (error) {
        console.log('Failed to load transactions', error)
      } finally {
        if (requestId === requestIdRef.current) {
          loadingMoreRef.current = false
          setLoading(false)
          setLoadingMore(false)
        }
      }
    },
    [user?.id, dateRange, typeFilter, accountId, debouncedSearch, weekStartsOn]
  )

  useFocusEffect(
    useCallback(() => {
      load('reset')
    }, [load])
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await load('reset')
    } finally {
      setRefreshing(false)
    }
  }, [load])

  const accountOptions = useMemo(
    () => [
      { label: 'All accounts', value: '' },
      ...accounts.map((account) => ({
        label: account.isPrimary
          ? `${account.name || 'Account'} · Primary`
          : account.name || 'Account',
        value: account.id || '',
      })),
    ],
    [accounts]
  )

  const typeLabel = TYPE_OPTIONS.find((item) => item.value === typeFilter)?.label ?? 'All types'
  const accountLabel =
    accountOptions.find((option) => option.value === accountId)?.label ?? 'All accounts'
  const dateLabel = dateRangeChipLabel(dateRange)

  const hasActiveFilters =
    typeFilter !== 'all' || accountId !== '' || dateRange.preset !== 'all' || Boolean(search.trim())

  return (
    <ScreenWrapper style={{ backgroundColor: '#000' }}>
      <View className="flex-1 px-5">
        <Header
          title="Transactions"
          leftIcon={<BackButton />}
          rightIcon={
            <TouchableOpacity
              onPress={() => router.push('/(modals)/transactionModal')}
              hitSlop={10}
            >
              <Plus size={verticalScale(24)} color="#a3e635" weight="bold" />
            </TouchableOpacity>
          }
          className="mb-4"
        />

        <Input
          placeholder="Search notes or category"
          value={search}
          onChangeText={setSearch}
          icon={<MagnifyingGlass size={18} color="#a3a3a3" />}
        />

        <View className="mb-4 mt-3 flex-row gap-2">
          <FilterChip
            label={typeFilter === 'all' ? 'Type' : typeLabel}
            active={typeFilter !== 'all'}
            onPress={() => typeSheetRef.current?.present()}
          />
          <FilterChip
            label={accountId ? accountLabel : 'Account'}
            active={Boolean(accountId)}
            onPress={() => accountSheetRef.current?.present()}
          />
          <FilterChip
            label={dateRange.preset === 'all' ? 'Date' : dateLabel}
            active={dateRange.preset !== 'all'}
            onPress={() => dateSheetRef.current?.present()}
          />
        </View>

        {loading && items.length === 0 ? (
          <Loading />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id ?? `${item.accountId}-${item.date}`}
            showsVerticalScrollIndicator={false}
            refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={{ gap: 12, paddingBottom: 32, flexGrow: 1 }}
            ListEmptyComponent={
              <EmptyState
                message={hasActiveFilters ? 'No matching transactions' : 'No transactions yet'}
              />
            }
            ListFooterComponent={
              hasMore ? (
                <LoadMoreButton loading={loadingMore} onPress={() => load('more')} />
              ) : null
            }
            renderItem={({ item, index }) => (
              <TransactionRow
                item={item}
                index={index}
                onPress={(txn) =>
                  router.push({
                    pathname: '/(modals)/transactionModal',
                    params: { id: txn.id },
                  })
                }
              />
            )}
          />
        )}
      </View>

      <BottomSheetSelect
        ref={typeSheetRef}
        title="Transaction type"
        options={TYPE_OPTIONS}
        value={typeFilter}
        onChange={(value) => setTypeFilter(value as FilterType)}
      />

      <BottomSheetSelect
        ref={accountSheetRef}
        title="Account"
        options={accountOptions}
        value={accountId}
        onChange={setAccountId}
      />

      <DateRangeBottomSheet ref={dateSheetRef} value={dateRange} onChange={setDateRange} />
    </ScreenWrapper>
  )
}

export default TransactionsScreen
