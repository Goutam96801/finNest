import { expenseCategories, getCategoryByValue } from '@/constants/data'
import { startOfWeek as startOfWeekUtil } from '@/utils/week'
import { supabase } from '../supabase'

export type StatsPeriod = 'week' | 'month' | 'year'

export type StatsSeriesPoint = {
  label: string
  income: number
  expense: number
}

export type StatsCategoryPoint = {
  category: string
  label: string
  amount: number
  percent: number
  bgColor: string
}

export type StatisticsResult = {
  income: number
  expense: number
  net: number
  series: StatsSeriesPoint[]
  categories: StatsCategoryPoint[]
  from: string
  to: string
}

type TxRow = {
  type: 'income' | 'expense'
  amount: number
  category: string | null
  transaction_date: string
  account_id: string
}

const startOfDay = (d: Date) => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

const endOfDay = (d: Date) => {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

const addDays = (d: Date, days: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}

const toDateKey = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const formatDateInput = (d: Date) => toDateKey(d)

async function getEarliestTransactionDate(userId: string, accountId?: string | null) {
  let query = supabase
    .from('transactions')
    .select('transaction_date')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .in('type', ['income', 'expense'])
    .order('transaction_date', { ascending: true })
    .limit(1)

  if (accountId) query = query.eq('account_id', accountId)

  const { data, error } = await query
  if (error) throw error
  if (!data?.[0]?.transaction_date) return null
  return new Date(data[0].transaction_date)
}

/** Resolve chart window for the shared Weekly / Monthly / Yearly control */
export async function getPeriodWindow(
  userId: string,
  period: StatsPeriod,
  accountId?: string | null,
  now = new Date(),
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 0
): Promise<{ from: Date; to: Date }> {
  const today = startOfDay(now)

  if (period === 'week') {
    const weekStart = startOfWeekUtil(today, weekStartsOn)
    const weekEnd = addDays(weekStart, 6)
    return { from: startOfDay(weekStart), to: endOfDay(weekEnd) }
  }

  if (period === 'month') {
    // Last 12 calendar months ending this month (e.g. Mar 25 … Feb 26)
    const endMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    const startMonth = new Date(today.getFullYear(), today.getMonth() - 11, 1)
    return { from: startOfDay(startMonth), to: endOfDay(endMonth) }
  }

  // Yearly: first transaction year → current year (full history)
  const earliest = await getEarliestTransactionDate(userId, accountId)
  const startYear = earliest ? earliest.getFullYear() : today.getFullYear()
  const from = startOfDay(new Date(startYear, 0, 1))
  const to = endOfDay(new Date(today.getFullYear(), 11, 31))
  return { from, to }
}

type BucketMode = 'daily' | 'monthly' | 'yearly'

function resolveBucketMode(period: StatsPeriod): BucketMode {
  if (period === 'week') return 'daily'
  if (period === 'month') return 'monthly'
  return 'yearly'
}

function buildEmptySeries(period: StatsPeriod, from: Date, to: Date): StatsSeriesPoint[] {
  const points: StatsSeriesPoint[] = []
  const start = startOfDay(from)
  const end = startOfDay(to)
  const mode = resolveBucketMode(period)

  if (mode === 'daily') {
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
      points.push({
        label: d.toLocaleDateString('en-US', { weekday: 'short' }),
        income: 0,
        expense: 0,
      })
    }
    return points
  }

  if (mode === 'monthly') {
    let y = start.getFullYear()
    let m = start.getMonth()
    const endY = end.getFullYear()
    const endM = end.getMonth()
    while (y < endY || (y === endY && m <= endM)) {
      const d = new Date(y, m, 1)
      const month = d.toLocaleDateString('en-US', { month: 'short' })
      const yy = String(d.getFullYear()).slice(2)
      points.push({ label: `${month} ${yy}`, income: 0, expense: 0 })
      m += 1
      if (m > 11) {
        m = 0
        y += 1
      }
    }
    return points
  }

  // yearly
  for (let y = start.getFullYear(); y <= end.getFullYear(); y += 1) {
    points.push({ label: String(y), income: 0, expense: 0 })
  }
  return points
}

function seriesIndexForDate(period: StatsPeriod, from: Date, to: Date, date: Date): number {
  const start = startOfDay(from)
  const end = startOfDay(to)
  const d = startOfDay(date)
  if (d < start || d > end) return -1

  const mode = resolveBucketMode(period)
  if (mode === 'daily') {
    return Math.floor((d.getTime() - start.getTime()) / 86400000)
  }
  if (mode === 'monthly') {
    return (d.getFullYear() - start.getFullYear()) * 12 + (d.getMonth() - start.getMonth())
  }
  return d.getFullYear() - start.getFullYear()
}

export async function getStatistics(input: {
  userId: string
  period: StatsPeriod
  accountId?: string | null
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6
}): Promise<StatisticsResult> {
  const { userId, period, accountId, weekStartsOn = 0 } = input
  if (!userId) throw new Error('User not authenticated')

  const { from, to } = await getPeriodWindow(userId, period, accountId, new Date(), weekStartsOn)

  let query = supabase
    .from('transactions')
    .select('type, amount, category, transaction_date, account_id')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .in('type', ['income', 'expense'])
    .gte('transaction_date', from.toISOString())
    .lte('transaction_date', to.toISOString())

  if (accountId) {
    query = query.eq('account_id', accountId)
  }

  const { data, error } = await query
  if (error) throw error

  const rows = (data ?? []) as TxRow[]
  const series = buildEmptySeries(period, from, to)

  let income = 0
  let expense = 0
  const categoryMap: Record<string, number> = {}

  for (const row of rows) {
    const amount = Number(row.amount ?? 0)
    const date = new Date(row.transaction_date)
    const idx = seriesIndexForDate(period, from, to, date)
    if (idx >= 0 && idx < series.length) {
      if (row.type === 'income') series[idx].income += amount
      if (row.type === 'expense') series[idx].expense += amount
    }

    if (row.type === 'income') income += amount
    if (row.type === 'expense') {
      expense += amount
      const slug = row.category && expenseCategories[row.category] ? row.category : 'others'
      categoryMap[slug] = (categoryMap[slug] ?? 0) + amount
    }
  }

  const categories: StatsCategoryPoint[] = Object.entries(categoryMap)
    .map(([category, amount]) => {
      const meta = getCategoryByValue(category)
      return {
        category,
        label: meta.label,
        amount,
        percent: expense > 0 ? (amount / expense) * 100 : 0,
        bgColor: meta.bgColor,
      }
    })
    .sort((a, b) => b.amount - a.amount)

  return {
    income,
    expense,
    net: income - expense,
    series,
    categories,
    from: formatDateInput(from),
    to: formatDateInput(to),
  }
}
