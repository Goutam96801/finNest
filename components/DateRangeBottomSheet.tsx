import DatePickerField from '@/components/DatePickerField'
import Typo from '@/components/Typo'
import type { BottomSheetSelectHandle } from '@/components/BottomSheetSelect'
import { showAlert } from '@/context/alertContext'
import { startOfWeek } from '@/utils/week'
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet'
import { Check } from 'phosphor-react-native'
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export type DateRangePreset =
  | 'all'
  | 'today'
  | 'week'
  | 'month'
  | 'year'
  | 'custom'

export type DateRangeValue = {
  preset: DateRangePreset
  from?: string
  to?: string
}

type DateRangeBottomSheetProps = {
  title?: string
  value: DateRangeValue
  onChange: (value: DateRangeValue) => void
}

const PRESETS: { label: string; value: DateRangePreset }[] = [
  { label: 'All time', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'This week', value: 'week' },
  { label: 'This month', value: 'month' },
  { label: 'This year', value: 'year' },
  { label: 'Custom range', value: 'custom' },
]

const todayKey = () => new Date().toISOString().slice(0, 10)

export const dateRangeChipLabel = (value: DateRangeValue) => {
  switch (value.preset) {
    case 'today':
      return 'Today'
    case 'week':
      return 'This week'
    case 'month':
      return 'This month'
    case 'year':
      return 'This year'
    case 'custom':
      if (value.from && value.to) return `${value.from.slice(5)} → ${value.to.slice(5)}`
      return 'Custom'
    default:
      return 'All dates'
  }
}

export function resolveDateRangeBounds(
  value: DateRangeValue,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 0
): { from?: Date; to?: Date } {
  const now = new Date()
  const startOfDay = (d: Date) => {
    const x = new Date(d)
    x.setHours(0, 0, 0, 0)
    return x
  }
  const endOfDay = (d: Date) => {
    const x = new Date(d)
    x.setHours(23, 59, 59, 999)
    return x
  }

  if (value.preset === 'all') return {}
  if (value.preset === 'today') {
    return { from: startOfDay(now), to: endOfDay(now) }
  }
  if (value.preset === 'week') {
    const from = startOfWeek(now, weekStartsOn)
    const to = new Date(from)
    to.setDate(from.getDate() + 6)
    return { from, to: endOfDay(to) }
  }
  if (value.preset === 'month') {
    const from = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1))
    const to = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0))
    return { from, to }
  }
  if (value.preset === 'year') {
    const from = startOfDay(new Date(now.getFullYear(), 0, 1))
    const to = endOfDay(new Date(now.getFullYear(), 11, 31))
    return { from, to }
  }
  // custom
  const from = value.from ? startOfDay(new Date(`${value.from}T00:00:00`)) : undefined
  const to = value.to ? endOfDay(new Date(`${value.to}T00:00:00`)) : undefined
  return { from, to }
}

const DateRangeBottomSheet = forwardRef<BottomSheetSelectHandle, DateRangeBottomSheetProps>(
  ({ title = 'Date range', value, onChange }, ref) => {
    const sheetRef = useRef<BottomSheetModal>(null)
    const insets = useSafeAreaInsets()
    const snapPoints = useMemo(() => ['55%', '75%'], [])
    const [draftPreset, setDraftPreset] = useState<DateRangePreset>(value.preset)
    const [draftFrom, setDraftFrom] = useState(value.from || todayKey())
    const [draftTo, setDraftTo] = useState(value.to || todayKey())

    useImperativeHandle(ref, () => ({
      present: () => {
        setDraftPreset(value.preset)
        setDraftFrom(value.from || todayKey())
        setDraftTo(value.to || todayKey())
        sheetRef.current?.present()
      },
      dismiss: () => sheetRef.current?.dismiss(),
    }))

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.6}
        />
      ),
      []
    )

    const apply = (preset: DateRangePreset) => {
      if (preset === 'custom') {
        if (draftFrom > draftTo) {
          showAlert('Invalid range', 'From date must be on or before To date.')
          return
        }
        onChange({ preset: 'custom', from: draftFrom, to: draftTo })
      } else {
        onChange({ preset })
      }
      sheetRef.current?.dismiss()
    }

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: '#171717' }}
        handleIndicatorStyle={{ backgroundColor: '#737373' }}
      >
        <BottomSheetScrollView
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingBottom: Math.max(insets.bottom, 20),
          }}
        >
          <View className="mb-3 px-2">
            <Typo size={18} fontWeight="600" color="#f5f5f5">
              {title}
            </Typo>
          </View>

          {PRESETS.map((item) => {
            const selected = draftPreset === item.value
            return (
              <TouchableOpacity
                key={item.value}
                onPress={() => {
                  setDraftPreset(item.value)
                  if (item.value !== 'custom') apply(item.value)
                }}
                className="mb-1 flex-row items-center justify-between rounded-xl px-4 py-3.5"
                style={{ backgroundColor: selected ? '#262626' : 'transparent' }}
              >
                <Typo color="#f5f5f5" size={15}>
                  {item.label}
                </Typo>
                {selected ? <Check size={20} color="#a3e635" weight="bold" /> : null}
              </TouchableOpacity>
            )
          })}

          {draftPreset === 'custom' ? (
            <View className="mt-3 gap-3 px-2">
              <DatePickerField
                label="From"
                value={draftFrom}
                onChange={setDraftFrom}
                maximumDate={new Date(`${draftTo}T00:00:00`)}
              />
              <DatePickerField
                label="To"
                value={draftTo}
                onChange={setDraftTo}
                minimumDate={new Date(`${draftFrom}T00:00:00`)}
              />
              <TouchableOpacity
                onPress={() => apply('custom')}
                activeOpacity={0.85}
                className="mt-2 items-center justify-center rounded-2xl bg-[#a3e635] py-3.5"
              >
                <Typo fontWeight="700" color="#000">
                  Apply range
                </Typo>
              </TouchableOpacity>
            </View>
          ) : null}
        </BottomSheetScrollView>
      </BottomSheetModal>
    )
  }
)

DateRangeBottomSheet.displayName = 'DateRangeBottomSheet'

export default DateRangeBottomSheet
