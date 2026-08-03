import BackButton from '@/components/BackButton'
import EmptyState from '@/components/EmptyState'
import Header from '@/components/Header'
import Input from '@/components/Input'
import Loading from '@/components/Loading'
import ModalWrapper from '@/components/ModalWrapper'
import {
    formatTransactionAmount,
    formatTransactionDate,
    getTransactionCategory,
} from '@/components/TransactionList'
import Typo from '@/components/Typo'
import { useAuth } from '@/context/authContext'
import type { AppNotification } from '@/lib/services/notifications'
import { globalSearch, type GlobalSearchResults } from '@/lib/services/search'
import {
    addSearchHistory,
    getSearchHistory,
    removeSearchHistory,
} from '@/lib/services/searchHistory'
import type { Subscription } from '@/lib/services/subscriptions'
import { Account } from '@/lib/types'
import { TransactionType } from '@/types'
import { useRouter } from 'expo-router'
import { Bell, ClockCounterClockwise, MagnifyingGlass, Repeat, Wallet, X } from 'phosphor-react-native'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    Keyboard,
    SectionList,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native'

type SearchSection = {
  title: string
  data: SearchRow[]
}

type SearchRow =
  | { kind: 'account'; item: Account }
  | { kind: 'transaction'; item: TransactionType }
  | { kind: 'subscription'; item: Subscription }
  | { kind: 'notification'; item: AppNotification }

const EMPTY_RESULTS: GlobalSearchResults = {
  accounts: [],
  transactions: [],
  subscriptions: [],
  notifications: [],
}

const formatDue = (value: string) => {
  const date = new Date(`${value}T00:00:00`)
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const ResultRow = ({
  title,
  subtitle,
  trailing,
  icon,
  onPress,
}: {
  title: string
  subtitle?: string
  trailing?: string
  icon: React.ReactNode
  onPress: () => void
}) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.85}
    className="mb-2 flex-row items-center gap-3 rounded-2xl border border-[#404040] bg-[#262626] px-4 py-3"
  >
    <View className="h-10 w-10 items-center justify-center rounded-xl bg-[#171717]">
      {icon}
    </View>
    <View className="min-w-0 flex-1">
      <Typo fontWeight="600" color="#f5f5f5" textProps={{ numberOfLines: 1 }}>
        {title}
      </Typo>
      {subtitle ? (
        <Typo size={12} color="#a3a3a3" className="mt-0.5" textProps={{ numberOfLines: 1 }}>
          {subtitle}
        </Typo>
      ) : null}
    </View>
    {trailing ? (
      <Typo size={13} fontWeight="600" color="#e5e5e5">
        {trailing}
      </Typo>
    ) : null}
  </TouchableOpacity>
)

const SearchModal = () => {
  const { user } = useAuth()
  const router = useRouter()
  const inputRef = useRef<TextInput>(null)

  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [results, setResults] = useState<GlobalSearchResults>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 350)
    return () => clearTimeout(focusTimer)
  }, [])

  useEffect(() => {
    let cancelled = false
    const loadHistory = async () => {
      if (!user?.id) {
        setHistory([])
        setHistoryLoaded(true)
        return
      }
      const items = await getSearchHistory(user.id)
      if (!cancelled) {
        setHistory(items)
        setHistoryLoaded(true)
      }
    }
    loadHistory()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (!user?.id || !debounced) {
        setResults(EMPTY_RESULTS)
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const data = await globalSearch(user.id, debounced)
        if (!cancelled) setResults(data)
      } catch (error) {
        console.log('Global search failed', error)
        if (!cancelled) setResults(EMPTY_RESULTS)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [user?.id, debounced])

  const rememberSearch = useCallback(
    async (term: string) => {
      if (!user?.id) return
      const next = await addSearchHistory(user.id, term)
      setHistory(next)
    },
    [user?.id]
  )

  const sections = useMemo<SearchSection[]>(() => {
    const next: SearchSection[] = []
    if (results.accounts.length) {
      next.push({
        title: 'Accounts',
        data: results.accounts.map((item) => ({ kind: 'account', item })),
      })
    }
    if (results.transactions.length) {
      next.push({
        title: 'Transactions',
        data: results.transactions.map((item) => ({ kind: 'transaction', item })),
      })
    }
    if (results.subscriptions.length) {
      next.push({
        title: 'Subscriptions',
        data: results.subscriptions.map((item) => ({ kind: 'subscription', item })),
      })
    }
    if (results.notifications.length) {
      next.push({
        title: 'Notifications',
        data: results.notifications.map((item) => ({ kind: 'notification', item })),
      })
    }
    return next
  }, [results])

  const hasQuery = Boolean(debounced)
  const isEmpty = hasQuery && !loading && sections.length === 0

  const openResult = async (row: SearchRow) => {
    if (debounced) await rememberSearch(debounced)
    Keyboard.dismiss()
    if (row.kind === 'account') {
      router.push({ pathname: '/(modals)/accountModal', params: { id: row.item.id } })
      return
    }
    if (row.kind === 'transaction') {
      router.push({ pathname: '/(modals)/transactionModal', params: { id: row.item.id } })
      return
    }
    if (row.kind === 'subscription') {
      router.push('/subscriptions')
      return
    }
    router.push('/(modals)/notificationsModal')
  }

  const submitSearch = async () => {
    const term = query.trim()
    if (!term) return
    setDebounced(term)
    await rememberSearch(term)
    Keyboard.dismiss()
  }

  const applyHistoryTerm = (term: string) => {
    setQuery(term)
    setDebounced(term)
  }

  const deleteHistoryTerm = async (term: string) => {
    if (!user?.id) return
    const next = await removeSearchHistory(user.id, term)
    setHistory(next)
  }

  return (
    <ModalWrapper>
      <View className="flex-1 px-5">
        <Header title="Search" leftIcon={<BackButton />} className="mb-4" />

        <Input
          inputRef={inputRef}
          placeholder="Search accounts, transactions..."
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          onSubmitEditing={submitSearch}
          icon={<MagnifyingGlass size={18} color="#a3a3a3" />}
        />

        <View className="mt-4 flex-1">
          {!hasQuery ? (
            !historyLoaded ? (
              <Loading />
            ) : history.length === 0 ? (
              <EmptyState message="No recent searches" />
            ) : (
              <View>
                <Typo size={13} fontWeight="600" color="#a3a3a3" className="mb-2">
                  Recent searches
                </Typo>
                {history.map((term) => (
                  <View
                    key={term}
                    className="mb-2 flex-row items-center rounded-2xl border border-[#404040] bg-[#262626] px-3 py-2.5"
                  >
                    <TouchableOpacity
                      onPress={() => applyHistoryTerm(term)}
                      activeOpacity={0.85}
                      className="min-w-0 flex-1 flex-row items-center gap-3"
                    >
                      <ClockCounterClockwise size={18} color="#a3a3a3" />
                      <Typo color="#f5f5f5" size={15} textProps={{ numberOfLines: 1 }}>
                        {term}
                      </Typo>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => deleteHistoryTerm(term)}
                      hitSlop={10}
                      className="h-9 w-9 items-center justify-center"
                    >
                      <X size={16} color="#a3a3a3" weight="bold" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )
          ) : loading && sections.length === 0 ? (
            <Loading />
          ) : isEmpty ? (
            <EmptyState message="No results found" />
          ) : (
            <SectionList
              sections={sections}
              keyExtractor={(item, index) => {
                if (item.kind === 'account') return `a-${item.item.id}`
                if (item.kind === 'transaction') return `t-${item.item.id ?? index}`
                if (item.kind === 'subscription') return `s-${item.item.id}`
                return `n-${item.item.id}`
              }}
              stickySectionHeadersEnabled={false}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 32 }}
              renderSectionHeader={({ section }) => (
                <Typo size={13} fontWeight="600" color="#a3a3a3" className="mb-2 mt-3">
                  {section.title}
                </Typo>
              )}
              renderItem={({ item }) => {
                if (item.kind === 'account') {
                  const account = item.item
                  return (
                    <ResultRow
                      title={account.name || 'Account'}
                      subtitle={[account.bankName, account.type].filter(Boolean).join(' · ')}
                      trailing={`₹${Number(account.balance ?? 0).toLocaleString('en-IN')}`}
                      icon={<Wallet size={20} color="#a3e635" weight="fill" />}
                      onPress={() => openResult(item)}
                    />
                  )
                }

                if (item.kind === 'transaction') {
                  const txn = item.item
                  const category = getTransactionCategory(txn)
                  const Icon = category.icon
                  return (
                    <ResultRow
                      title={category.label}
                      subtitle={[formatTransactionDate(txn.date), txn.description]
                        .filter(Boolean)
                        .join(' · ')}
                      trailing={formatTransactionAmount(txn.amount, txn.type)}
                      icon={<Icon size={20} color="#fff" weight="fill" />}
                      onPress={() => openResult(item)}
                    />
                  )
                }

                if (item.kind === 'subscription') {
                  const sub = item.item
                  return (
                    <ResultRow
                      title={sub.name}
                      subtitle={`Due ${formatDue(sub.nextDueDate)}`}
                      trailing={`₹${Number(sub.amount).toLocaleString('en-IN')}`}
                      icon={<Repeat size={20} color="#a3e635" weight="bold" />}
                      onPress={() => openResult(item)}
                    />
                  )
                }

                const note = item.item
                return (
                  <ResultRow
                    title={note.title}
                    subtitle={note.body || undefined}
                    icon={<Bell size={20} color="#a3e635" weight="fill" />}
                    onPress={() => openResult(item)}
                  />
                )
              }}
            />
          )}
        </View>
      </View>
    </ModalWrapper>
  )
}

export default SearchModal
