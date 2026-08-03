import {
  getBalanceVisible,
  getWeekStartsOn,
  setBalanceVisible as persistBalanceVisible,
  setWeekStartsOn as persistWeekStartsOn,
  type WeekStartsOn,
} from '@/lib/prefs/devicePrefs'
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

type PrefsContextValue = {
  ready: boolean
  balanceVisible: boolean
  setBalanceVisible: (visible: boolean) => void
  weekStartsOn: WeekStartsOn
  setWeekStartsOn: (value: WeekStartsOn) => void
}

const PrefsContext = createContext<PrefsContextValue | null>(null)

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [balanceVisible, setBalanceVisibleState] = useState(true)
  const [weekStartsOn, setWeekStartsOnState] = useState<WeekStartsOn>(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [visible, weekStart] = await Promise.all([getBalanceVisible(), getWeekStartsOn()])
      if (cancelled) return
      setBalanceVisibleState(visible)
      setWeekStartsOnState(weekStart)
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const setBalanceVisible = useCallback((visible: boolean) => {
    setBalanceVisibleState(visible)
    void persistBalanceVisible(visible)
  }, [])

  const setWeekStartsOn = useCallback((value: WeekStartsOn) => {
    setWeekStartsOnState(value)
    void persistWeekStartsOn(value)
  }, [])

  const value = useMemo(
    () => ({
      ready,
      balanceVisible,
      setBalanceVisible,
      weekStartsOn,
      setWeekStartsOn,
    }),
    [ready, balanceVisible, setBalanceVisible, weekStartsOn, setWeekStartsOn]
  )

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>
}

export function usePrefs() {
  const ctx = useContext(PrefsContext)
  if (!ctx) throw new Error('usePrefs must be used within PrefsProvider')
  return ctx
}
