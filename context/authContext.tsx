import {
  createSessionFromUrl,
  refreshAuthUser,
} from '@/lib/auth/sessionFromUrl'
import { supabase } from '@/lib/supabase'
import { Session, User } from '@supabase/supabase-js'
import * as Linking from 'expo-linking'
import { useRouter } from 'expo-router'
import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AppState, type AppStateStatus } from 'react-native'

type AuthContextValue = {
  user: User | null
  session: Session | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

function isAuthCallbackUrl(url: string) {
  const normalized = url.toLowerCase()
  // Explicit callback route only — do NOT match "(auth)/login" etc.
  if (normalized.includes('auth/callback')) return true
  if (normalized.includes('access_token=')) return true
  if (normalized.includes('refresh_token=')) return true
  if (normalized.includes('token_hash=')) return true
  // PKCE code on callback-style links
  if (normalized.includes('code=') && normalized.includes('callback')) return true
  return false
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const handlingUrl = useRef(false)
  const hasRouted = useRef(false)

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session ?? null)
      setUser(data.session?.user ?? null)
      setLoading(false)

      // Cold start routing (don't wait for SIGNED_IN)
      if (!hasRouted.current) {
        hasRouted.current = true
        router.replace(data.session ? '/(tabs)' : '/(auth)/welcome')
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return

      setSession(nextSession ?? null)
      setUser(nextSession?.user ?? null)
      setLoading(false)

      if (event === 'SIGNED_OUT') {
        hasRouted.current = true
        router.replace('/(auth)/welcome')
        return
      }

      // Fresh login / signup only — not session restore (INITIAL_SESSION)
      if (event === 'SIGNED_IN') {
        hasRouted.current = true
        router.replace('/(tabs)')
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [router])

  // Email-confirm deep links only
  useEffect(() => {
    const handleUrl = async (url: string | null) => {
      if (!url || handlingUrl.current) return
      if (!isAuthCallbackUrl(url)) return

      handlingUrl.current = true
      try {
        const result = await createSessionFromUrl(url)
        if (result.success) {
          const latest = await refreshAuthUser()
          if (latest) setUser(latest)
          hasRouted.current = true
          router.replace('/(tabs)')
        } else {
          console.log('Auth deep link ignored/failed', result.msg)
        }
      } finally {
        handlingUrl.current = false
      }
    }

    Linking.getInitialURL().then((url) => {
      if (url) void handleUrl(url)
    })

    const sub = Linking.addEventListener('url', ({ url }) => {
      void handleUrl(url)
    })

    return () => sub.remove()
  }, [router])

  // Refresh user when returning from mail app (email change)
  useEffect(() => {
    const onAppState = async (state: AppStateStatus) => {
      if (state !== 'active') return
      const latest = await refreshAuthUser()
      if (latest) {
        setUser(latest)
        const { data } = await supabase.auth.getSession()
        setSession(data.session ?? null)
      }
    }

    const sub = AppState.addEventListener('change', onAppState)
    return () => sub.remove()
  }, [])

  const value = useMemo(
    () => ({
      user,
      session,
      loading,
    }),
    [loading, session, user]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return context
}
