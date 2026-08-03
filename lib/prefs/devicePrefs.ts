import AsyncStorage from '@react-native-async-storage/async-storage'

const BALANCE_KEY = 'finnest:balance-visible'
const WEEK_START_KEY = 'finnest:week-starts-on'

/** 0 = Sunday … 6 = Saturday */
export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6

export const WEEKDAY_OPTIONS: { label: string; value: WeekStartsOn }[] = [
  { label: 'Sunday', value: 0 },
  { label: 'Monday', value: 1 },
  { label: 'Tuesday', value: 2 },
  { label: 'Wednesday', value: 3 },
  { label: 'Thursday', value: 4 },
  { label: 'Friday', value: 5 },
  { label: 'Saturday', value: 6 },
]

export async function getBalanceVisible(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(BALANCE_KEY)
    if (value === null) return true
    return value === '1'
  } catch {
    return true
  }
}

export async function setBalanceVisible(visible: boolean): Promise<void> {
  await AsyncStorage.setItem(BALANCE_KEY, visible ? '1' : '0')
}

export async function getWeekStartsOn(): Promise<WeekStartsOn> {
  try {
    const value = await AsyncStorage.getItem(WEEK_START_KEY)
    const parsed = Number(value)
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 6) {
      return parsed as WeekStartsOn
    }
    return 0
  } catch {
    return 0
  }
}

export async function setWeekStartsOn(value: WeekStartsOn): Promise<void> {
  await AsyncStorage.setItem(WEEK_START_KEY, String(value))
}
