import BottomSheetSelect, { type BottomSheetSelectHandle } from '@/components/BottomSheetSelect'
import AppRefreshControl from '@/components/AppRefreshControl'
import EmptyState from '@/components/EmptyState'
import Loading from '@/components/Loading'
import ScreenWrapper from '@/components/ScreenWrapper'
import Typo from '@/components/Typo'
import { showAlert } from '@/context/alertContext'
import { useAuth } from '@/context/authContext'
import { usePrefs } from '@/context/prefsContext'
import { BarChart, LineChart, PieChart } from '@/lib/charts'
import { getAccounts } from '@/lib/services/accounts'
import { getStatistics, StatisticsResult, StatsPeriod } from '@/lib/services/statistics'
import { Account } from '@/lib/types'
import { verticalScale } from '@/utils/styling'
import SegmentedControl from '@react-native-segmented-control/segmented-control'
import { useFocusEffect } from 'expo-router'
import { Wallet } from 'phosphor-react-native'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dimensions, ScrollView, TouchableOpacity, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'

const PERIOD_VALUES = ['Weekly', 'Monthly', 'Yearly'] as const
const PERIOD_MAP: StatsPeriod[] = ['week', 'month', 'year']

const emptyStats = (): StatisticsResult => ({
  income: 0,
  expense: 0,
  net: 0,
  series: [],
  categories: [],
  from: '',
  to: '',
})

const formatAxis = (value: number) => {
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`
  if (value >= 1000) return `₹${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
  return `₹${Math.round(value)}`
}

const ChartCard = ({
  children,
  loading,
  empty,
  emptyMessage,
  className = '',
}: {
  children: React.ReactNode
  loading: boolean
  empty: boolean
  emptyMessage: string
  className?: string
}) => (
  <View className={`min-h-[280px] justify-center rounded-2xl border border-[#404040] bg-[#171717] px-2 py-5 ${className}`}>
    {loading ? (
      <Loading />
    ) : empty ? (
      <EmptyState message={emptyMessage} className="py-12" />
    ) : (
      children
    )}
  </View>
)

const Statistics = () => {
  const { user } = useAuth()
  const { weekStartsOn } = usePrefs()
  const accountSheetRef = useRef<BottomSheetSelectHandle>(null)
  const hasLoadedOnce = useRef(false)
  const screenWidth = Dimensions.get('window').width
  const chartWidth = screenWidth - 48

  const [period, setPeriod] = useState<StatsPeriod>('week')
  const [accountId, setAccountId] = useState('')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [stats, setStats] = useState<StatisticsResult>(emptyStats())

  const [loadingBar, setLoadingBar] = useState(true)
  const [loadingTrend, setLoadingTrend] = useState(true)
  const [loadingPie, setLoadingPie] = useState(true)
  const [pageLoading, setPageLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

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

  const accountLabel =
    accountOptions.find((option) => option.value === accountId)?.label ?? 'All accounts'

  const loadStats = useCallback(async (opts?: { silent?: boolean }) => {
    if (!user?.id) return

    if (!opts?.silent && !hasLoadedOnce.current) setPageLoading(true)
    if (!opts?.silent) {
      setLoadingBar(true)
      setLoadingTrend(true)
      setLoadingPie(true)
    }

    try {
      const [accountRows, result] = await Promise.all([
        getAccounts(user.id),
        getStatistics({
          userId: user.id,
          period,
          accountId: accountId || null,
          weekStartsOn,
        }),
      ])

      setAccounts(accountRows)
      setStats(result)
      hasLoadedOnce.current = true
    } catch (error) {
      console.log('Failed to load statistics', error)
      showAlert('Unable to load', 'Could not load statistics. Please try again.')
      setLoadingBar(false)
      setLoadingTrend(false)
      setLoadingPie(false)
    } finally {
      setPageLoading(false)
      if (!opts?.silent) {
        // Reveal charts one-by-one so each card shows its own loader state
        setLoadingBar(false)
        setTimeout(() => setLoadingTrend(false), 120)
        setTimeout(() => setLoadingPie(false), 220)
      }
    }
  }, [user?.id, period, accountId, weekStartsOn])

  useFocusEffect(
    useCallback(() => {
      loadStats()
    }, [loadStats])
  )

  useEffect(() => {
    if (!hasLoadedOnce.current) return
    loadStats()
  }, [period, accountId, loadStats])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await loadStats({ silent: true })
    } finally {
      setRefreshing(false)
    }
  }, [loadStats])

  const barMax = useMemo(() => {
    const max = stats.series.reduce(
      (acc, point) => Math.max(acc, point.income, point.expense),
      0
    )
    return max > 0 ? max * 1.2 : 100
  }, [stats.series])

  const trendMax = useMemo(() => {
    const max = stats.series.reduce((acc, point) => Math.max(acc, point.expense), 0)
    return max > 0 ? max * 1.2 : 100
  }, [stats.series])

  const periodIndex = PERIOD_MAP.indexOf(period)

  const groupedBarData = useMemo(() => {
    const rows: any[] = []
    stats.series.forEach((point, index) => {
      const isLast = index === stats.series.length - 1
      rows.push({
        value: point.income,
        label: point.label,
        spacing: 2,
        labelWidth: period === 'month' ? 40 : period === 'year' ? 36 : 32,
        labelTextStyle: { color: '#a3a3a3', fontSize: 10 },
        frontColor: '#86efac',
      })
      rows.push({
        value: point.expense,
        frontColor: '#f87171',
        spacing: isLast ? 20 : 14,
      })
    })
    return rows
  }, [stats.series, period])

  const expenseLineData = useMemo(
    () =>
      stats.series.map((point) => ({
        // Keep values >= 0 so the curved line can't dip under the axis
        value: Math.max(0, Number(point.expense) || 0),
        label: point.label,
        labelTextStyle: { color: '#a3a3a3', fontSize: 10 },
      })),
    [stats.series]
  )

  const pieData = useMemo(
    () =>
      stats.categories.map((item) => ({
        value: item.amount,
        color: item.bgColor,
        text: `${Math.round(item.percent)}%`,
      })),
    [stats.categories]
  )

  const barChartKey = `bar-${period}-${stats.from}-${stats.to}-${groupedBarData.length}`
  const trendChartKey = `trend-${period}-${stats.from}-${stats.to}-${expenseLineData.length}`

  const lineSpacing = period === 'year' ? 52 : period === 'month' ? 48 : 42

  return (
    <ScreenWrapper style={{ backgroundColor: '#000' }}>
      <View className="flex-1 px-5">
        <Animated.View
          entering={FadeInDown.delay(0).springify().damping(40).stiffness(200)}
          className="mb-4 flex-row items-center justify-between"
        >
          <Typo size={24} fontWeight="700" color="#f5f5f5">
            Statistics
          </Typo>

          <TouchableOpacity
            onPress={() => accountSheetRef.current?.present()}
            activeOpacity={0.8}
            className="max-w-[48%] flex-row items-center gap-2 rounded-xl border border-[#404040] bg-[#262626] px-3 py-2"
          >
            <Wallet size={verticalScale(18)} color="#a3e635" weight="fill" />
            <Typo size={12} color="#f5f5f5" textProps={{ numberOfLines: 1 }}>
              {accountLabel}
            </Typo>
          </TouchableOpacity>
        </Animated.View>

        {pageLoading && !hasLoadedOnce.current ? (
          <Loading />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}
            refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          >
            <Animated.View
              entering={FadeInDown.delay(40).springify().damping(40).stiffness(200)}
              className="mb-5"
            >
              <View className="py-1">
              <SegmentedControl
                values={[...PERIOD_VALUES]}
                selectedIndex={periodIndex}
                onChange={(event) => {
                  const index = event.nativeEvent.selectedSegmentIndex
                  setPeriod(PERIOD_MAP[index] ?? 'week')
                }}
                style={{ height: 48 }}
                backgroundColor="#262626"
                tintColor="#f5f5f5"
                fontStyle={{ color: '#a3a3a3', fontSize: 14 }}
                activeFontStyle={{ color: '#171717', fontSize: 14, fontWeight: '600' }}
              />
              </View>
            </Animated.View>

            {/* Overview bar chart */}
            <Animated.View
              entering={FadeInDown.delay(80).springify().damping(40).stiffness(200)}
              className="mb-5"
            >
              <Typo size={16} fontWeight="600" color="#f5f5f5" className="mb-3">
                Overview
              </Typo>
              <ChartCard
                loading={loadingBar}
                empty={stats.series.length === 0}
                emptyMessage="No activity in this period"
                className="bg-[#000]"
              >
                <View className="py-2">
                  <BarChart
                    key={barChartKey}
                    data={groupedBarData}
                    height={250}
                    width={chartWidth}
                    barWidth={14}
                    spacing={2}
                    initialSpacing={16}
                    endSpacing={28}
                    roundedTop
                    roundedBottom
                    hideRules={false}
                    rulesColor="#333333"
                    rulesType="solid"
                    xAxisColor="#333333"
                    yAxisColor="transparent"
                    yAxisThickness={0}
                    xAxisThickness={0}
                    noOfSections={4}
                    maxValue={barMax}
                    yAxisTextStyle={{ color: '#a3a3a3', fontSize: 10 }}
                    formatYLabel={(value) => formatAxis(Number(value))}
                    isAnimated
                    animationDuration={450}
                    scrollToEnd
                    scrollAnimation={false}
                    disableScroll={false}
                    showScrollIndicator
                    nestedScrollEnabled
                    activeOpacity={0.9}
                  />
                </View>
              </ChartCard>
            </Animated.View>

            {/* Expense trend */}
            <Animated.View
              entering={FadeInDown.delay(120).springify().damping(40).stiffness(200)}
              className="mb-5"
            >
              <Typo size={16} fontWeight="600" color="#f5f5f5" className="mb-3">
                Expense Trend
              </Typo>
              <ChartCard
                loading={loadingTrend}
                empty={stats.series.every((p) => p.expense === 0)}
                emptyMessage="No expenses in this period"
              >
                <View className="py-2">
                  <LineChart
                    key={trendChartKey}
                    data={expenseLineData}
                    height={240}
                    width={chartWidth}
                    spacing={lineSpacing}
                    initialSpacing={16}
                    endSpacing={28}
                    color="#f87171"
                    thickness={3.5}
                    // Avoid bezier overshoot under the X-axis when values hit 0
                    curved={false}
                    hideDataPoints={false}
                    dataPointsRadius={3}
                    dataPointsColor="#f87171"
                    hideRules={false}
                    rulesColor="#333333"
                    rulesType="solid"
                    xAxisColor="#333333"
                    yAxisColor="transparent"
                    yAxisThickness={0}
                    xAxisThickness={0}
                    noOfSections={4}
                    noOfSectionsBelowXAxis={0}
                    mostNegativeValue={0}
                    maxValue={trendMax}
                    yAxisOffset={0}
                    yAxisTextStyle={{ color: '#a3a3a3', fontSize: 10 }}
                    formatYLabel={(value) => formatAxis(Math.max(0, Number(value)))}
                    isAnimated
                    animationDuration={500}
                    scrollToEnd
                    scrollAnimation={false}
                    disableScroll={false}
                    showScrollIndicator
                    nestedScrollEnabled
                    backgroundColor="transparent"
                  />
                </View>
              </ChartCard>
            </Animated.View>

            {/* Category pie */}
            <Animated.View entering={FadeInDown.delay(160).springify().damping(40).stiffness(200)}>
              <Typo size={16} fontWeight="600" color="#f5f5f5" className="mb-3">
                Expenses by category
              </Typo>
              <ChartCard
                loading={loadingPie}
                empty={pieData.length === 0}
                emptyMessage="No expenses in this period"
                className="px-4"
              >
                <View className="items-center py-2">
                  <PieChart
                    data={pieData}
                    donut
                    radius={110}
                    innerRadius={64}
                    innerCircleColor="#171717"
                    showText
                    textColor="#f5f5f5"
                    textSize={11}
                    focusOnPress
                    centerLabelComponent={() => (
                      <View className="items-center">
                        <Typo size={12} color="#a3a3a3">
                          Expense
                        </Typo>
                        <Typo size={14} fontWeight="700" color="#f5f5f5">
                          {formatAxis(stats.expense)}
                        </Typo>
                      </View>
                    )}
                  />

                  <View className="mt-6 w-full gap-2.5">
                    {stats.categories.map((item) => (
                      <View key={item.category} className="flex-row items-center justify-between">
                        <View className="flex-row items-center gap-2">
                          <View
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: item.bgColor }}
                          />
                          <Typo size={13} color="#e5e5e5">
                            {item.label}
                          </Typo>
                        </View>
                        <Typo size={13} color="#a3a3a3">
                          {Math.round(item.percent)}% · {formatAxis(item.amount)}
                        </Typo>
                      </View>
                    ))}
                  </View>
                </View>
              </ChartCard>
            </Animated.View>
          </ScrollView>
        )}
      </View>

      <BottomSheetSelect
        ref={accountSheetRef}
        title="Account"
        options={accountOptions}
        value={accountId}
        onChange={setAccountId}
      />
    </ScreenWrapper>
  )
}

export default Statistics
