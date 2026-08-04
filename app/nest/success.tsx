import Typo from '@/components/Typo'
import { useNest } from '@/context/nestContext'
import { useRouter } from 'expo-router'
import React, { useEffect } from 'react'
import { ActivityIndicator, View } from 'react-native'

/** Deep link / return target after Razorpay subscription payment. */
export default function NestSuccessScreen() {
  const router = useRouter()
  const { refresh } = useNest()

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      // Webhook may lag a second behind redirect
      await refresh()
      await new Promise((r) => setTimeout(r, 1200))
      if (!cancelled) await refresh()
      if (!cancelled) router.replace('/settings')
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [refresh, router])

  return (
    <View className="flex-1 items-center justify-center bg-black px-6">
      <ActivityIndicator color="#a3e635" size="large" />
      <Typo color="#a3a3a3" className="mt-4" size={15}>
        Activating Nest…
      </Typo>
    </View>
  )
}
