import {
  getFynnProStatus,
  type FynnProStatus,
} from '@/lib/services/fynnPro'
import { useAuth } from '@/context/authContext'
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

type FynnProContextValue = {
  status: FynnProStatus | null
  loading: boolean
  refresh: () => Promise<void>
  locked: boolean
  lockReason: 'subscription_required' | 'daily_limit' | null
}

const FynnProContext = createContext<FynnProContextValue | null>(null)

const emptyStatus: FynnProStatus = {
  subscribed: false,
  plan: null,
  periodEnd: null,
  used: 0,
  limit: 20,
  resetsAt: null,
}

export function FynnProProvider({ children }: PropsWithChildren) {
  const { user } = useAuth()
  const [status, setStatus] = useState<FynnProStatus | null>(null)
  const [loading, setLoading] = useState(!!user)

  const refresh = useCallback(async () => {
    if (!user) {
      setStatus(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setStatus(await getFynnProStatus())
    } catch {
      setStatus((current) => current ?? emptyStatus)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const lockReason = useMemo<FynnProContextValue['lockReason']>(() => {
    if (!user) return null
    if (loading && !status) return null
    if (!status || !status.subscribed) return 'subscription_required'
    if (status.used >= status.limit) return 'daily_limit'
    return null
  }, [user, loading, status])

  const value = useMemo<FynnProContextValue>(() => ({
    status,
    loading,
    refresh,
    locked: lockReason !== null,
    lockReason,
  }), [status, loading, refresh, lockReason])

  return <FynnProContext.Provider value={value}>{children}</FynnProContext.Provider>
}

export function useFynnPro() {
  const ctx = useContext(FynnProContext)
  if (!ctx) throw new Error('useFynnPro must be used within FynnProProvider')
  return ctx
}
