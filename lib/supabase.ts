import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { AppState, Platform } from 'react-native'

/**
 * True when this module is evaluated in a server-like runtime such as Expo
 * static rendering / SSR. During export, Metro can evaluate the bundle in
 * Node even when a web-like global exists, so we detect Node directly.
 */
const isServerRuntime =
  typeof process !== 'undefined' &&
  !!process.versions?.node &&
  (typeof window === 'undefined' || typeof document === 'undefined')

/** No-op storage so auth init does not touch AsyncStorage (uses `window` on web). */
const ssrStorage = {
  getItem: (_key: string) => Promise.resolve(null as string | null),
  setItem: (_key: string, _value: string) => Promise.resolve(),
  removeItem: (_key: string) => Promise.resolve(),
}

/**
 * Minimal WebSocket stub for Node SSR.
 * supabase-js realtime requires a transport at createClient time; realtime is
 * client-only and this stub is never used for real connections on device.
 */
class SSRWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readonly readyState = SSRWebSocket.CLOSED
  readonly url: string
  readonly protocol = ''
  binaryType: BinaryType = 'blob'
  bufferedAmount = 0
  extensions = ''
  onclose: ((ev: CloseEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  onopen: ((ev: Event) => void) | null = null

  constructor(url: string | URL, _protocols?: string | string[]) {
    this.url = String(url)
  }

  close(_code?: number, _reason?: string) {}
  send(_data: string | ArrayBufferLike | Blob | ArrayBufferView) {}
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent(_event: Event) {
    return false
  }
}

const authStorage = isServerRuntime ? ssrStorage : AsyncStorage

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_KEY!,
  {
    auth: {
      storage: authStorage,
      autoRefreshToken: !isServerRuntime,
      persistSession: !isServerRuntime,
      detectSessionInUrl: false,
    },
    // Avoid "Node.js detected but native WebSocket not found" during static export
    ...(isServerRuntime || typeof WebSocket === 'undefined'
      ? {
          realtime: {
            // Cast: supabase expects a WebSocket constructor; SSR stub is sufficient
            transport: SSRWebSocket as unknown as typeof WebSocket,
          },
        }
      : {}),
  },
)

// Keep session refresh in sync with app foreground state (native only)
if (!isServerRuntime && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh()
    } else {
      supabase.auth.stopAutoRefresh()
    }
  })
}
