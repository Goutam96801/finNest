import * as Updates from 'expo-updates'
import { useEffect, useRef } from 'react'
import { AppState, type AppStateStatus } from 'react-native'

/**
 * In release builds, check the EAS `production` channel for a new OTA bundle
 * on launch and when returning to the foreground. Download + reload so users
 * never need Expo Go or a store visit for JS-only changes.
 */
export function OtaUpdatesBootstrap() {
  const busy = useRef(false)

  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return

    const run = async () => {
      if (busy.current) return
      busy.current = true
      try {
        const check = await Updates.checkForUpdateAsync()
        if (!check.isAvailable) return
        await Updates.fetchUpdateAsync()
        await Updates.reloadAsync()
      } catch (error) {
        console.log('OTA update check failed', error)
      } finally {
        busy.current = false
      }
    }

    void run()

    const onState = (state: AppStateStatus) => {
      if (state === 'active') void run()
    }
    const sub = AppState.addEventListener('change', onState)
    return () => sub.remove()
  }, [])

  return null
}
