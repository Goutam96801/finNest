import { useAuth } from '@/context/authContext'
import { getProfileImage } from '@/lib/services/image-service'
import { verticalScale } from '@/utils/styling'
import { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { Image } from 'expo-image'
import * as Icons from 'phosphor-react-native'
import React from 'react'
import { TouchableOpacity, View } from 'react-native'

const AVATAR_SIZE = verticalScale(30)

export default function CustomTabs({ state, descriptors, navigation }: BottomTabBarProps) {
  const { user } = useAuth()
  const avatarSource = getProfileImage(
    user?.user_metadata?.avatar_url || user?.user_metadata?.avatar
  )

  const tabbarIcons: Record<string, (isFocused: boolean) => React.ReactNode> = {
    index: (isFocused) => (
      <Icons.House
        size={AVATAR_SIZE}
        weight={isFocused ? 'fill' : 'regular'}
        color={isFocused ? '#a3e635' : '#a3a3a3'}
      />
    ),
    statistics: (isFocused) => (
      <Icons.ChartBar
        size={AVATAR_SIZE}
        weight={isFocused ? 'fill' : 'regular'}
        color={isFocused ? '#a3e635' : '#a3a3a3'}
      />
    ),
    accounts: (isFocused) => (
      <Icons.Wallet
        size={AVATAR_SIZE}
        weight={isFocused ? 'fill' : 'regular'}
        color={isFocused ? '#a3e635' : '#a3a3a3'}
      />
    ),
    profile: (isFocused) => (
      <View
        style={{
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          borderRadius: AVATAR_SIZE / 2,
          borderWidth: isFocused ? 2 : 1,
          borderColor: isFocused ? '#a3e635' : '#525252',
          overflow: 'hidden',
          backgroundColor: '#404040',
        }}
      >
        <Image
          source={typeof avatarSource === 'string' ? { uri: avatarSource } : avatarSource}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          transition={100}
        />
      </View>
    ),
  }

  return (
    <View className="h-[60px] w-full flex-row items-center justify-around border-t-[1px] border-t-[#404040] bg-[#262626]">
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key]
        const isFocused = state.index === index

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          })

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params)
          }
        }

        const onLongPress = () => {
          navigation.emit({
            type: 'tabLongPress',
            target: route.key,
          })
        }

        return (
          <TouchableOpacity
            key={route.name}
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            testID={options.tabBarButtonTestID}
            onPress={onPress}
            onLongPress={onLongPress}
            className="mb-[5px] items-center justify-center"
          >
            {tabbarIcons[route.name]?.(isFocused)}
          </TouchableOpacity>
        )
      })}
    </View>
  )
}
