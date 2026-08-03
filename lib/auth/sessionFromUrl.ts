import * as Linking from 'expo-linking'
import { supabase } from '@/lib/supabase'

/** Deep link used in auth confirmation emails (must be allow-listed in Supabase Auth). */
export function getAuthRedirectUrl(path = 'auth/callback') {
  return Linking.createURL(path)
}

/**
 * Complete auth from an inbound app URL (email confirm / magic link).
 * Supports PKCE `code` and legacy hash/query tokens.
 */
export async function createSessionFromUrl(url: string) {
  if (!url) return { success: false as const, msg: 'Missing URL' }

  try {
    const parsed = Linking.parse(url)
    const params: Record<string, string | undefined> = {
      ...(parsed.queryParams as Record<string, string | undefined>),
    }

    // Some clients put tokens in the hash fragment
    const hashIndex = url.indexOf('#')
    if (hashIndex >= 0) {
      const hash = url.slice(hashIndex + 1)
      for (const part of hash.split('&')) {
        const [key, value] = part.split('=')
        if (key) params[key] = decodeURIComponent(value ?? '')
      }
    }

    if (params.code) {
      const { error } = await supabase.auth.exchangeCodeForSession(params.code)
      if (error) return { success: false as const, msg: error.message }
      return { success: true as const }
    }

    if (params.access_token && params.refresh_token) {
      const { error } = await supabase.auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token,
      })
      if (error) return { success: false as const, msg: error.message }
      return { success: true as const }
    }

    // Email change confirmations may use token_hash + type
    if (params.token_hash && params.type) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: params.token_hash,
        type: params.type as 'email_change' | 'signup' | 'recovery' | 'invite' | 'magiclink' | 'email',
      })
      if (error) return { success: false as const, msg: error.message }
      return { success: true as const }
    }

    return { success: false as const, msg: 'No auth credentials in URL' }
  } catch (error: any) {
    return { success: false as const, msg: error?.message || 'Failed to open auth link' }
  }
}

export async function refreshAuthUser() {
  const { data, error } = await supabase.auth.getUser()
  if (error) return null
  return data.user
}
