import { AlertProvider } from '@/context/alertContext'
import { AuthProvider, useAuth } from '@/context/authContext'
import { PrefsProvider } from '@/context/prefsContext'
import { SubscriptionRemindersProvider } from '@/context/subscriptionRemindersContext'
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import { Stack, usePathname, useRootNavigationState, useRouter } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import React, { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import './global.css'

SplashScreen.preventAutoHideAsync().catch(() => {})

SplashScreen.setOptions({
  duration: 350,
  fade: true,
})

export const unstable_settings = {
  initialRouteName: 'index',
}

function isRestoredModal(pathname: string) {
  const p = pathname.toLowerCase()
  return (
    p.includes('modal') ||
    p.includes('privacypolicy') ||
    p.includes('auth/callback')
  )
}

function isBootTarget(pathname: string, hasSession: boolean) {
  if (!pathname || isRestoredModal(pathname)) return false
  if (hasSession) return true
  return (
    pathname.includes('welcome') ||
    pathname.includes('login') ||
    pathname.includes('register')
  )
}

function SplashGate({ children }: { children: React.ReactNode }) {
  const { loading, session } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const navState = useRootNavigationState()
  const redirected = useRef(false)
  const [booted, setBooted] = useState(false)

  // 1) Clear restored modals and land on the correct root screen
  useEffect(() => {
    if (loading || !navState?.key || redirected.current) return
    redirected.current = true

    try {
      if (router.canDismiss()) {
        router.dismissAll()
      }
    } catch {
      // ignore
    }

    router.replace(session ? '/(tabs)' : '/(auth)/welcome')
  }, [loading, session, navState?.key, router])

  // 2) Keep a black cover until we're on tabs/welcome (not a modal)
  useEffect(() => {
    if (loading || !redirected.current || booted) return
    if (!isBootTarget(pathname, !!session)) return

    const finish = async () => {
      await SplashScreen.hideAsync().catch(() => {})
      setBooted(true)
    }
    void finish()
  }, [loading, pathname, session, booted])

  // Safety: never block forever if pathname never matches
  useEffect(() => {
    if (loading || booted) return
    const t = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {})
      setBooted(true)
    }, 2500)
    return () => clearTimeout(t)
  }, [loading, booted])

  return (
    <View style={styles.root}>
      {children}
      {!booted ? <View style={styles.bootCover} pointerEvents="auto" /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  bootCover: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 9999,
    elevation: 9999,
  },
})

const modalOptions = {
  presentation: 'modal' as const,
  animation: 'slide_from_bottom' as const,
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <AuthProvider>
          <PrefsProvider>
            <AlertProvider>
              <SubscriptionRemindersProvider>
              <SplashGate>
                <Stack
                  screenOptions={{
                    headerShown: false,
                  }}
                >
                  <Stack.Screen name="index" />
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="(auth)/welcome" />
                  <Stack.Screen name="(auth)/login" />
                  <Stack.Screen name="(auth)/register" />
                  <Stack.Screen name="transactions" />
                  <Stack.Screen name="subscriptions" />
                  <Stack.Screen name="(modals)/profileModal" options={modalOptions} />
                  <Stack.Screen name="(modals)/accountModal" options={modalOptions} />
                  <Stack.Screen name="(modals)/transactionModal" options={modalOptions} />
                  <Stack.Screen name="(modals)/notificationsModal" options={modalOptions} />
                  <Stack.Screen name="(modals)/subscriptionModal" options={modalOptions} />
                  <Stack.Screen name="(modals)/searchModal" options={modalOptions} />
                  <Stack.Screen name="(modals)/privacyPolicy" options={modalOptions} />
                </Stack>
              </SplashGate>
              </SubscriptionRemindersProvider>
            </AlertProvider>
          </PrefsProvider>
        </AuthProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  )
}
