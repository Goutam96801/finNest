import Typo from '@/components/Typo'
import { colors, radius } from '@/constants/theme'
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker'
import { CalendarBlank } from 'phosphor-react-native'
import React, { useState } from 'react'
import { Modal, Platform, TouchableOpacity, View } from 'react-native'

type DatePickerFieldProps = {
  label?: string
  value: string
  onChange: (value: string) => void
  maximumDate?: Date
  minimumDate?: Date
}

const parseKey = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return new Date()
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

const toKey = (date: Date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const formatDisplay = (value: string) => {
  const date = parseKey(value)
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

const DatePickerField = ({
  label,
  value,
  onChange,
  maximumDate,
  minimumDate,
}: DatePickerFieldProps) => {
  const [iosOpen, setIosOpen] = useState(false)
  const [draft, setDraft] = useState(parseKey(value))

  const openPicker = () => {
    const current = parseKey(value)
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        maximumDate,
        minimumDate,
        onChange: (event: DateTimePickerEvent, selected?: Date) => {
          if (event.type === 'dismissed' || !selected) return
          onChange(toKey(selected))
        },
      })
      return
    }
    setDraft(current)
    setIosOpen(true)
  }

  return (
    <View>
      {label ? (
        <Typo size={13} color="#a3a3a3" className="mb-2">
          {label}
        </Typo>
      ) : null}

      <TouchableOpacity
        onPress={openPicker}
        activeOpacity={0.85}
        className="w-full flex-row items-center justify-between px-4"
        style={{
          minHeight: 56,
          borderRadius: radius._17,
          backgroundColor: colors.neutral800,
          borderWidth: 1.5,
          borderColor: colors.neutral700,
        }}
      >
        <Typo color={colors.white} size={15}>
          {formatDisplay(value)}
        </Typo>
        <CalendarBlank size={20} color={colors.primary} weight="bold" />
      </TouchableOpacity>

      {Platform.OS === 'ios' && iosOpen ? (
        <Modal transparent animationType="fade" visible onRequestClose={() => setIosOpen(false)}>
          <View className="flex-1 justify-end bg-black/70">
            <View className="rounded-t-3xl bg-[#171717] px-4 pb-8 pt-3">
              <View className="mb-2 flex-row items-center justify-between">
                <TouchableOpacity onPress={() => setIosOpen(false)} hitSlop={10}>
                  <Typo color="#a3a3a3">Cancel</Typo>
                </TouchableOpacity>
                <Typo fontWeight="600" color="#f5f5f5">
                  Select date
                </Typo>
                <TouchableOpacity
                  onPress={() => {
                    onChange(toKey(draft))
                    setIosOpen(false)
                  }}
                  hitSlop={10}
                >
                  <Typo color="#a3e635" fontWeight="700">
                    Done
                  </Typo>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={draft}
                mode="date"
                display="spinner"
                themeVariant="dark"
                maximumDate={maximumDate}
                minimumDate={minimumDate}
                onChange={(_: DateTimePickerEvent, selected?: Date) => {
                  if (selected) setDraft(selected)
                }}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  )
}

export default DatePickerField
