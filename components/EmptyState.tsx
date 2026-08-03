import Typo from '@/components/Typo'
import React from 'react'
import { View } from 'react-native'

type EmptyStateProps = {
  message: string
  className?: string
}

const EmptyState = ({ message, className }: EmptyStateProps) => {
  return (
    <View className={`flex-1 items-center justify-center py-12 ${className ?? ''}`}>
      <Typo color="#a3a3a3" size={15}>
        {message}
      </Typo>
    </View>
  )
}

export default EmptyState
