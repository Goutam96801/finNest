import Typo from '@/components/Typo'
import React from 'react'
import { View } from 'react-native'

const PrimaryBadge = () => {
  return (
    <View className="rounded-full bg-[#a3e635]/20 px-2 py-0.5">
      <Typo size={11} fontWeight="700" color="#a3e635">
        Primary
      </Typo>
    </View>
  )
}

export default PrimaryBadge
