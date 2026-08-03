import Typo from '@/components/Typo'
import { verticalScale } from '@/utils/styling'
import { DotsThreeOutline, ArrowDown, ArrowUp } from 'phosphor-react-native'
import React from 'react'
import { ImageBackground, StyleSheet, TouchableOpacity, View } from 'react-native'

type HomeCardProps = {
  totalBalance?: number
  income?: number
  expense?: number
  currencySymbol?: string
  onMorePress?: () => void
}

const formatAmount = (value: number) =>
  value.toLocaleString('en-IN', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })

const HomeCard = ({
  totalBalance = 0,
  income = 0,
  expense = 0,
  currencySymbol = '₹',
  onMorePress,
}: HomeCardProps) => {
  return (
    <ImageBackground
      source={require('../assets/images/card.png')}
      resizeMode="stretch"
      style={styles.card}
      imageStyle={styles.cardImage}
    >
      <View style={styles.content}>
        <View style={styles.topRow}>
          <View>
            <Typo size={14} color="#525252" fontWeight="500">
              Total Balance
            </Typo>
            <Typo size={32} color="#171717" fontWeight="700" className="mt-1">
              {currencySymbol}
              {formatAmount(totalBalance)}
            </Typo>
          </View>

          <TouchableOpacity onPress={onMorePress} hitSlop={12} activeOpacity={0.7}>
            <DotsThreeOutline size={verticalScale(24)} color="#262626" weight="fill" />
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
              {currencySymbol} {formatAmount(income)}
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
              {currencySymbol} {formatAmount(expense)}
            </Typo>
          </View>
        </View>
      </View>
    </ImageBackground>
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
})

export default HomeCard
