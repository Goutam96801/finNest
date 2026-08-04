import { useAuth } from '@/context/authContext'
import { getNestStatus, type NestStatus } from '@/lib/services/nest'
import React, {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { AppState, type AppStateStatus } from 'react-native'

type NestContextValue = {
  ready: boolean
  hasNest: boolean
  status: NestStatus | null
  refresh: () => Promise<void>
}

const NestContext = createContext<NestContextValue | null>(null)

const emptyStatus: NestStatus = {
  nestActive: false,
  nestStatus: null,
  nestPriceId: null,
  nestRenewsAt: null,
  razorpayCustomerId: null,
  razorpaySubscriptionId: null,
}

export function NestProvider({ children }: PropsWithChildren) {
  const { user, loading: authLoading } = useAuth()
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState<NestStatus | null>(null)

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setStatus(emptyStatus)
      setReady(true)
      return
    }
    try {
      const next = await getNestStatus(user.id)
      setStatus(next)
    } catch (error) {
      console.log('Failed to load Nest status', error)
      setStatus(emptyStatus)
    } finally {
      setReady(true)
    }
  }, [user?.id])

  useEffect(() => {
    if (authLoading) return
    void refresh()
  }, [authLoading, refresh])

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active' && user?.id) void refresh()
    }
    const sub = AppState.addEventListener('change', onChange)
    return () => sub.remove()
  }, [refresh, user?.id])

  const value = useMemo(
    () => ({
      ready,
      hasNest: Boolean(status?.nestActive),
      status,
      refresh,
    }),
    [ready, status, refresh]
  )

  return <NestContext.Provider value={value}>{children}</NestContext.Provider>
}

export function useNest() {
  const ctx = useContext(NestContext)
  if (!ctx) throw new Error('useNest must be used inside NestProvider')
  return ctx
}
