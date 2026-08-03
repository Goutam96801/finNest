import { ACCOUNT_ICON_OPTIONS } from '@/components/IconColorBottomSheet'
import Typo from '@/components/Typo'
import { colors, radius } from '@/constants/theme'
import { CaretDown } from 'phosphor-react-native'
import React from 'react'
import { TouchableOpacity, View } from 'react-native'

type AppearanceFieldProps = {
  icon: string
  color: string
  onPress: () => void
}

const AppearanceField = ({ icon, color, onPress }: AppearanceFieldProps) => {
  const IconComponent =
    ACCOUNT_ICON_OPTIONS.find((option) => option.name === icon)?.icon ??
    ACCOUNT_ICON_OPTIONS[0].icon

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className="w-full flex-row items-center justify-between px-4"
      style={{
        minHeight: 56,
        borderRadius: radius._17,
        backgroundColor: colors.neutral800,
        borderWidth: 1.5,
        borderColor: colors.neutral700,
      }}
    >
      <View className="flex-row items-center gap-3">
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            backgroundColor: color,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <IconComponent size={18} color="#fff" weight="fill" />
        </View>
        <Typo color={colors.white} size={15}>
          Icon & Color
        </Typo>
      </View>
      <CaretDown size={18} color={colors.neutral400} />
    </TouchableOpacity>
  )
}

export default AppearanceField
