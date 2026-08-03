import EmptyState from '@/components/EmptyState'
import Loading from '@/components/Loading'
import Typo from '@/components/Typo'
import { getCategoryByValue } from '@/constants/data'
import { TransactionListType, TransactionType } from '@/types'
import { verticalScale } from '@/utils/styling'
import * as Icons from 'phosphor-react-native'
import { Plus } from 'phosphor-react-native'
import React from 'react'
import { FlatList, TouchableOpacity, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'

type TransactionListProps = TransactionListType & {
  onAddPress?: () => void
  onItemPress?: (item: TransactionType) => void
  onViewAllPress?: () => void
  showViewAll?: boolean
  nestedScrollEnabled?: boolean
  ListHeaderComponent?: React.ReactElement | null
}

export const formatTransactionDate = (value: TransactionType['date']) => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    .toLowerCase()
}

export const formatTransactionAmount = (amount: number, type: TransactionType['type']) => {
  const prefix = type === 'income' ? '+ ' : type === 'expense' ? '- ' : '↔ '
  return `${prefix}₹${Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`
}

export const getTransactionCategory = (item: TransactionType) => {
  if (item.type === 'transfer') {
    return {
      label: 'Transfer',
      value: 'transfer',
      icon: Icons.ArrowsLeftRight,
      bgColor: '#334155',
    }
  }
  return getCategoryByValue(item.type === 'income' ? 'income' : item.category)
}

export const TransactionRow = ({
  item,
  index,
  onPress,
}: {
  item: TransactionType
  index: number
  onPress?: (item: TransactionType) => void
}) => {
  const category = getTransactionCategory(item)
  const IconComponent = category.icon
  const amountColor =
    item.type === 'income' ? '#16a34a' : item.type === 'transfer' ? '#93c5fd' : '#e11d48'

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify().damping(40).stiffness(200)}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => onPress?.(item)}
        className="flex-row items-center justify-between rounded-[18px] border border-[#404040] bg-[#262626] px-4 py-3"
      >
        <View className="flex-row items-center gap-3 flex-1 pr-3">
          <View
            style={{ backgroundColor: category.bgColor }}
            className="h-11 w-11 items-center justify-center rounded-2xl"
          >
            <IconComponent size={22} color="#fff" weight="fill" />
          </View>

          <View className="flex-1">
            <Typo fontWeight="600" color="#f5f5f5">
              {category.label}
            </Typo>
            <Typo size={13} color="#a3a3a3">
              {item.description?.trim() || 'No description'}
            </Typo>
          </View>
        </View>

        <View className="items-end">
          <Typo fontWeight="600" color={amountColor}>
            {formatTransactionAmount(item.amount, item.type)}
          </Typo>
          <Typo size={12} color="#a3a3a3">
            {formatTransactionDate(item.date)}
          </Typo>
        </View>
      </TouchableOpacity>
    </Animated.View>
  )
}

const TransactionList = ({
  data,
  title = 'Recent Transactions',
  loading = false,
  emptyListMessage = 'No transactions yet',
  onAddPress,
  onItemPress,
  onViewAllPress,
  showViewAll = true,
}: TransactionListProps) => {
  return (
    <View className="mt-6 flex-1">
      <View className="mb-3 flex-row items-center justify-between">
        <Typo size={18} fontWeight="600" color="#f5f5f5">
          {title}
        </Typo>
        {showViewAll ? (
          <TouchableOpacity onPress={onViewAllPress} hitSlop={10}>
            <Typo size={13} color="#a3e635" fontWeight="600">
              View all
            </Typo>
          </TouchableOpacity>
        ) : null}
      </View>

      <View className="flex-1 relative">
        {loading ? (
          <Loading />
        ) : (
          <FlatList
            data={data}
            keyExtractor={(item) => item.id ?? `${item.accountId}-${item.date}`}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              gap: 12,
              paddingBottom: 88,
              flexGrow: 1,
            }}
            ListEmptyComponent={<EmptyState message={emptyListMessage} />}
            renderItem={({ item, index }) => (
              <TransactionRow item={item} index={index} onPress={onItemPress} />
            )}
          />
        )}

        {onAddPress ? (
          <TouchableOpacity
            onPress={onAddPress}
            activeOpacity={0.85}
            className="absolute bottom-10 right-1 h-16 w-16 items-center justify-center rounded-full bg-[#a3e635]"
            style={{ elevation: 4 }}
          >
            <Plus size={verticalScale(30)} color="#000" weight="bold" />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  )
}

export default TransactionList
