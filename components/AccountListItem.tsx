import PrimaryBadge from '@/components/PrimaryBadge'
import Typo from '@/components/Typo'
import { Account } from '@/lib/types'
import * as Icon from 'phosphor-react-native'
import { CaretRight } from 'phosphor-react-native'
import React from 'react'
import { TouchableOpacity, View } from 'react-native'

type AccountListItemProps = {
  account: Account
  color?: string
  icon?: string
  onPress?: () => void
}

const ACCOUNT_CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  INR: '₹',
}

const AccountListItem = ({ account, color = '#3B82F6', icon = 'Wallet', onPress }: AccountListItemProps) => {
  const symbol = ACCOUNT_CURRENCY_SYMBOLS[account.currency ?? 'INR'] ?? account.currency ?? '₹'

  const iconName = icon || 'Wallet'
  const IconComponent = {
    Wallet: Icon.Wallet,
    Bank: Icon.Bank,
    CreditCard: Icon.CreditCard,
    PiggyBank: Icon.PiggyBank,
    House: Icon.House,
    CurrencyDollar: Icon.CurrencyDollar,
    Coin: Icon.Coin,
    Receipt: Icon.Receipt,
    Briefcase: Icon.Briefcase,
    HandCoins: Icon.HandCoins,
  }[iconName] ?? Icon.Wallet

  const bankName = account.bankName?.trim() || null
  const last4 = account.accountNumberLast4?.trim() || null
  const maskedAccountNumber = last4 ? `****${last4}` : null
  const metaParts = [bankName, maskedAccountNumber].filter(Boolean)
  const metaLine = metaParts.length > 0 ? metaParts.join(' · ') : null

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      disabled={!onPress}
      className='flex-row items-center justify-between rounded-[18px] border border-[#404040] bg-[#262626] px-4 py-3'
    >
      <View className='flex-row items-center gap-3 flex-1 pr-2'>
        <View
          style={{ backgroundColor: color, width: 44, height: 44, borderRadius: 14 }}
          className='items-center justify-center'
        >
          <IconComponent size={20} color='#fff' weight='fill' />
        </View>

        <View className='flex-1'>
          <View className='flex-row items-center gap-2 flex-wrap'>
            <Typo fontWeight='600' color='#f5f5f5'>
              {account.name || 'Account'}
            </Typo>
            {account.isPrimary ? <PrimaryBadge /> : null}
          </View>
          {metaLine ? (
            <Typo size={12} color='#a3a3a3'>
              {metaLine}
            </Typo>
          ) : null}
          <Typo size={13} color='#a3a3a3'>
            {`${symbol}${Number(account.balance ?? 0).toFixed(2)}`}
          </Typo>
        </View>
      </View>

      <CaretRight size={20} color='#a3a3a3' />
    </TouchableOpacity>
  )
}

export default AccountListItem
