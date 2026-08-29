import Typo from '@/components/Typo'
import { BlurView } from 'expo-blur'
import { useRouter } from 'expo-router'
import { Lock } from 'phosphor-react-native'
import React from 'react'
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native'

type Props = {
  reason: 'subscription_required' | 'daily_limit'
}

export default function FynnLockOverlay({ reason }: Props) {
  const router = useRouter()
  const isLimit = reason === 'daily_limit'

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFillObject} className="z-20">
      <BlurView
        pointerEvents="none"
        intensity={10}
        tint="dark"
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFillObject}
      />
      <View pointerEvents="box-none" className="flex-1 items-center justify-center px-8">
        <View pointerEvents="auto" className="items-center">
          <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-lime-400/20">
            <Lock size={30} color="#a3e635" weight="fill" />
          </View>
          <Typo size={20} fontWeight="600" className="text-center text-neutral-100">
            {isLimit ? 'Daily limit reached' : 'Subscribe to chat with Fynn'}
          </Typo>
          <Typo size={14} className="mt-2 text-center text-neutral-400">
            {isLimit
              ? "You've used 20 / 20 messages today. Resets at midnight IST."
              : 'Unlock Fynn Pro to ask about your money, charts, and budgets.'}
          </Typo>
          {!isLimit ? (
            <TouchableOpacity
              accessibilityLabel="Open Fynn Pro"
              onPress={() => router.push('/fynn-pro')}
              className="mt-6 rounded-2xl bg-lime-400 px-6 py-3.5"
            >
              <Typo size={15} fontWeight="600" className="text-neutral-900">
                {Platform.OS === 'ios' ? 'View Fynn Pro' : 'Subscribe'}
              </Typo>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  )
}
