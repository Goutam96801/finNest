import type { WeekStartsOn } from '@/lib/prefs/devicePrefs'

/** Align calendar week to any weekday (0 Sunday … 6 Saturday). */
export function startOfWeek(date: Date, weekStartsOn: WeekStartsOn = 0) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  const day = result.getDay()
  const diff = (day - weekStartsOn + 7) % 7
  result.setDate(result.getDate() - diff)
  return result
}
