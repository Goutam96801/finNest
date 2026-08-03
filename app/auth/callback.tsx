import { createSessionFromUrl, refreshAuthUser } from '@/lib/auth/sessionFromUrl'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as Linking from 'expo-linking'
import { useEffect } from 'react'
import { Text, View } from 'react-native'

/**
 * Email-confirm redirect target: finnestmob://auth/callback?...
 * Always lands on home tabs after handling (or skipping) the link.
 */
export default function AuthCallbackScreen() {
  const router = useRouter()
  const params = useLocalSearchParams()

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      const hasCredential =
        Boolean(params.code) ||
        Boolean(params.access_token) ||
        Boolean(params.token_hash) ||
        Boolean(params.refresh_token)

      if (hasCredential) {
        const base = Linking.createURL('auth/callback')
        const query = new URLSearchParams()
        for (const [key, value] of Object.entries(params)) {
          const raw = Array.isArray(value) ? value[0] : value
          if (raw != null && String(raw).length) query.set(key, String(raw))
        }
        const qs = query.toString()
        const url = qs ? `${base}${base.includes('?') ? '&' : '?'}${qs}` : base
        const result = await createSessionFromUrl(url)
        if (!cancelled && result.success) {
          await refreshAuthUser()
        }
      }

      if (!cancelled) router.replace('/(tabs)')
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [params, router])

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
      <Text style={{ color: '#a3a3a3' }}>Opening FinNest…</Text>
    </View>
  )
}
