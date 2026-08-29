import Typo from '@/components/Typo'
import { verticalScale } from '@/utils/styling'
import { CaretRight } from 'phosphor-react-native'
import React, { Children, isValidElement } from 'react'
import { Switch, TouchableOpacity, View } from 'react-native'

type SettingsGroupProps = {
  label?: string
  children: React.ReactNode
}

export function SettingsGroup({ label, children }: SettingsGroupProps) {
  const items = Children.toArray(children).filter(isValidElement)

  return (
    <View className="mb-5">
      {label ? (
        <Typo size={13} fontWeight="600" color="#a3a3a3" className="mb-2 ml-1">
          {label}
        </Typo>
      ) : null}
      <View className="overflow-hidden rounded-2xl border border-[#404040] bg-[#171717]">
        {items.map((child, index) => (
          <View key={child.key ?? index}>
            {child}
            {index < items.length - 1 ? (
              <View className="ml-[62px] h-px bg-[#333333]" />
            ) : null}
          </View>
        ))}
      </View>
    </View>
  )
}

type SettingsRowProps = {
  title: string
  subtitle?: string
  icon: React.ReactNode
  bgColor: string
  onPress?: () => void
  right?: React.ReactNode
  danger?: boolean
}

export function SettingsRow({
  title,
  subtitle,
  icon,
  bgColor,
  onPress,
  right,
  danger,
}: SettingsRowProps) {
  return (
    <TouchableOpacity
      disabled={!onPress}
      onPress={onPress}
      activeOpacity={onPress ? 0.85 : 1}
      className="flex-row items-center gap-3 px-3.5 py-3.5"
    >
      <View
        className="h-10 w-10 items-center justify-center rounded-xl"
        style={{ backgroundColor: bgColor }}
      >
        {icon}
      </View>
      <View className="min-w-0 flex-1">
        <Typo size={15} fontWeight="500" color={danger ? '#f87171' : '#f5f5f5'}>
          {title}
        </Typo>
        {subtitle ? (
          <Typo size={12} color="#a3a3a3" className="mt-0.5">
            {subtitle}
          </Typo>
        ) : null}
      </View>
      {right ??
        (onPress ? <CaretRight size={verticalScale(18)} color="#a3a3a3" weight="bold" /> : null)}
    </TouchableOpacity>
  )
}

export function SettingsSwitch({
  value,
  onValueChange,
  disabled,
}: {
  value: boolean
  onValueChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: '#404040', true: '#a3e635' }}
      thumbColor="#f5f5f5"
    />
  )
}
