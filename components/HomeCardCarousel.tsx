import PrimaryBadge from '@/components/PrimaryBadge'
import Typo from '@/components/Typo'
import { usePrefs } from '@/context/prefsContext'
import { AccountTotalsMap } from '@/lib/services/transactions'
import { Account } from '@/lib/types'
import { verticalScale } from '@/utils/styling'
import { ArrowDown, ArrowUp, Eye, EyeSlash } from 'phosphor-react-native'
import React, { useEffect, useRef, useState } from 'react'
import {
  Dimensions,
  ImageBackground,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native'

type HomeCardCarouselProps = {
  totalBalance: number
  income: number
  expense: number
  accounts: Account[]
  accountTotals?: AccountTotalsMap
  currencySymbol?: string
}

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const CARD_WIDTH = SCREEN_WIDTH - 40
const HIDDEN_BALANCE = '••••••'

const formatAmount = (value: number) =>
  value.toLocaleString('en-IN', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })

const HomeCardCarousel = ({
  totalBalance,
  income,
  expense,
  accounts,
  accountTotals = {},
  currencySymbol = '₹',
}: HomeCardCarouselProps) => {
  const { balanceVisible: preferenceVisible } = usePrefs()
  // Session-only reveal; does not change Settings / persisted preference.
  const [sessionVisible, setSessionVisible] = useState(preferenceVisible)
  const [page, setPage] = useState(0)
  const scrollRef = useRef<ScrollView>(null)

  useEffect(() => {
    setSessionVisible(preferenceVisible)
  }, [preferenceVisible])

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / CARD_WIDTH)
    setPage(next)
  }

  const pages: Array<{
    key: string
    title: string
    amount: number
    subtitle?: string
    income: number
    expense: number
    isPrimary?: boolean
  }> = [
    {
      key: 'total',
      title: 'Total Balance',
      amount: totalBalance,
      income,
      expense,
    },
    ...accounts.map((account) => {
      const totals = account.id ? accountTotals[account.id] : undefined
      return {
        key: account.id || account.name || 'account',
        title: account.name || 'Account',
        amount: Number(account.balance ?? 0),
        subtitle: [account.bankName, account.accountNumberLast4 ? `****${account.accountNumberLast4}` : null]
          .filter(Boolean)
          .join(' · '),
        income: totals?.income ?? 0,
        expense: totals?.expense ?? 0,
        isPrimary: Boolean(account.isPrimary),
      }
    }),
  ]

  const displayAmount = (amount: number) =>
    sessionVisible ? `${currencySymbol}${formatAmount(amount)}` : `${currencySymbol}${HIDDEN_BALANCE}`

  const displayStat = (amount: number) =>
    sessionVisible
      ? `${currencySymbol} ${formatAmount(amount)}`
      : `${currencySymbol} ${HIDDEN_BALANCE}`

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        snapToInterval={CARD_WIDTH}
        snapToAlignment="start"
        contentContainerStyle={{}}
      >
        {pages.map((item) => (
          <View key={item.key} style={{ width: CARD_WIDTH }}>
            <ImageBackground
              source={require('../assets/images/card.png')}
              resizeMode="stretch"
              style={styles.card}
              imageStyle={styles.cardImage}
            >
              <View style={styles.content}>
                <View style={styles.topRow}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <View style={styles.titleRow}>
                      <Typo size={14} color="#525252" fontWeight="500">
                        {item.title}
                      </Typo>
                      {item.isPrimary ? <PrimaryBadge /> : null}
                    </View>
                    <Typo size={32} color="#171717" fontWeight="700" className="mt-1">
                      {displayAmount(item.amount)}
                    </Typo>
                    {item.subtitle ? (
                      <Typo size={12} color="#737373" className="mt-1">
                        {item.subtitle}
                      </Typo>
                    ) : null}
                  </View>

                  <TouchableOpacity
                    onPress={() => setSessionVisible((prev) => !prev)}
                    hitSlop={12}
                    activeOpacity={0.7}
                  >
                    {sessionVisible ? (
                      <Eye size={verticalScale(24)} color="#262626" weight="bold" />
                    ) : (
                      <EyeSlash size={verticalScale(24)} color="#262626" weight="bold" />
                    )}
                  </TouchableOpacity>
                </View>

                <View style={styles.bottomRow}>
                  <View style={styles.statBlock}>
                    <View style={styles.statHeader}>
                      <View style={styles.statIcon}>
                        <ArrowDown size={14} color="#404040" weight="bold" />
                      </View>
                      <Typo size={14} color="#525252" fontWeight="500">
                        Income
                      </Typo>
                    </View>
                    <Typo size={18} color="#16a34a" fontWeight="700" className="mt-1">
                      {displayStat(item.income)}
                    </Typo>
                  </View>

                  <View style={styles.statBlock}>
                    <View style={styles.statHeader}>
                      <View style={styles.statIcon}>
                        <ArrowUp size={14} color="#404040" weight="bold" />
                      </View>
                      <Typo size={14} color="#525252" fontWeight="500">
                        Expense
                      </Typo>
                    </View>
                    <Typo size={18} color="#e11d48" fontWeight="700" className="mt-1">
                      {displayStat(item.expense)}
                    </Typo>
                  </View>
                </View>
              </View>
            </ImageBackground>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {pages.map((item, index) => (
          <View key={item.key} style={[styles.dot, index === page ? styles.dotActive : null]} />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    minHeight: verticalScale(190),
    justifyContent: 'space-between',
  },
  cardImage: {
    borderRadius: 28,
  },
  content: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 34,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  statBlock: {
    flex: 1,
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#404040',
  },
  dotActive: {
    backgroundColor: '#a3e635',
    width: 16,
  },
})

export default HomeCardCarousel
