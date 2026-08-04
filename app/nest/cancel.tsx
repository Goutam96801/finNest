import Typo from '@/components/Typo'
import { useRouter } from 'expo-router'
import React, { useEffect } from 'react'
import { View } from 'react-native'

/** Deep link / return target when user abandons Razorpay checkout. */
export default function NestCancelScreen() {
  const router = useRouter()

  useEffect(() => {
    const t = setTimeout(() => router.replace('/settings'), 400)
    return () => clearTimeout(t)
  }, [router])

  return (
    <View className="flex-1 items-center justify-center bg-black px-6">
      <Typo color="#a3a3a3" size={15}>
        Checkout cancelled
      </Typo>
    </View>
  )
}
