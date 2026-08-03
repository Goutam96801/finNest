import React from 'react'
import { ActivityIndicator, ActivityIndicatorProps, View } from 'react-native'

type LoadingProps = ActivityIndicatorProps & {
  /** Fill parent and center (page/list loaders). Default true. */
  fill?: boolean
}

const Loading = ({ size = 'large', color = '#a3e635', fill = true }: LoadingProps) => {
  if (!fill) {
    return <ActivityIndicator size={size} color={color} />
  }

  return (
    <View className="flex-1 items-center justify-center py-10">
      <ActivityIndicator size={size} color={color} />
    </View>
  )
}

export default Loading
