import { colors, radius } from '@/constants/theme'
import { InputProps } from '@/types'
import React, { useState } from 'react'
import { TextInput, View } from 'react-native'

const Input = ({
  icon,
  containerClassName = '',
  inputClassName = '',
  inputRef,
  style,
  onFocus,
  onBlur,
  ...textInputProps
}: InputProps) => {
  const [focused, setFocused] = useState(false)

  return (
    <View
      className={`w-full flex-row items-center px-4 gap-2.5 ${containerClassName}`}
      style={{
        minHeight: 56,
        borderRadius: radius._17,
        backgroundColor: colors.neutral800,
        borderWidth: 1.5,
        borderColor: focused ? colors.primary : colors.neutral700,
      }}
    >
      {icon}
      <TextInput
        ref={inputRef}
        placeholderTextColor={colors.neutral400}
        selectionColor={colors.primary}
        cursorColor={colors.primary}
        onFocus={(event) => {
          setFocused(true)
          onFocus?.(event)
        }}
        onBlur={(event) => {
          setFocused(false)
          onBlur?.(event)
        }}
        className={`flex-1 text-base text-white py-3 ${inputClassName}`}
        style={[{ color: colors.white }, style]}
        {...textInputProps}
      />
    </View>
  )
}

export default Input
