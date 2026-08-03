import Typo from '@/components/Typo'
import { colors, radius } from '@/constants/theme'
import { CaretDown } from 'phosphor-react-native'
import React from 'react'
import { TouchableOpacity } from 'react-native'

type SelectFieldProps = {
  valueLabel: string
  placeholder?: string
  onPress: () => void
  containerClassName?: string
}

const SelectField = ({
  valueLabel,
  placeholder = 'Select',
  onPress,
  containerClassName = '',
}: SelectFieldProps) => {
  const showPlaceholder = !valueLabel

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className={`w-full flex-row items-center justify-between px-4 ${containerClassName}`}
      style={{
        minHeight: 56,
        borderRadius: radius._17,
        backgroundColor: colors.neutral800,
        borderWidth: 1.5,
        borderColor: colors.neutral700,
      }}
    >
      <Typo color={showPlaceholder ? colors.neutral400 : colors.white} size={15}>
        {showPlaceholder ? placeholder : valueLabel}
      </Typo>
      <CaretDown size={18} color={colors.neutral400} />
    </TouchableOpacity>
  )
}

export default SelectField
