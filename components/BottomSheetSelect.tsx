import Typo from '@/components/Typo'
import {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetModal,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet'
import { Check } from 'phosphor-react-native'
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react'
import { TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export type SelectOption = { label: string; value: string }

export type BottomSheetSelectHandle = {
  present: () => void
  dismiss: () => void
}

type BottomSheetSelectProps = {
  title: string
  options: SelectOption[]
  value?: string
  onChange: (value: string) => void
}

const BottomSheetSelect = forwardRef<BottomSheetSelectHandle, BottomSheetSelectProps>(
  ({ title, options, value, onChange }, ref) => {
    const sheetRef = useRef<BottomSheetModal>(null)
    const insets = useSafeAreaInsets()
    const snapPoints = useMemo(() => {
      // Keep a usable default height even for 1–2 options
      if (options.length <= 2) return ['42%']
      if (options.length <= 5) return ['48%']
      return ['55%', '75%']
    }, [options.length])

    useImperativeHandle(ref, () => ({
      present: () => sheetRef.current?.present(),
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
        <View className="px-5 pb-2">
          <Typo size={18} fontWeight="600" color="#f5f5f5">
            {title}
          </Typo>
        </View>
        <BottomSheetFlatList
          data={options}
          keyExtractor={(item) => item.value}
          contentContainerStyle={{
            paddingBottom: Math.max(insets.bottom, 16),
            paddingHorizontal: 8,
          }}
          renderItem={({ item }) => {
            const selected = item.value === value
            return (
              <TouchableOpacity
                onPress={() => {
                  onChange(item.value)
                  sheetRef.current?.dismiss()
                }}
                className="flex-row items-center justify-between px-4 py-3.5 rounded-xl"
                style={{ backgroundColor: selected ? '#262626' : 'transparent' }}
              >
                <Typo color="#f5f5f5" size={15}>
                  {item.label}
                </Typo>
                {selected ? <Check size={20} color="#a3e635" weight="bold" /> : null}
              </TouchableOpacity>
            )
          }}
        />
      </BottomSheetModal>
    )
  }
)

BottomSheetSelect.displayName = 'BottomSheetSelect'

export default BottomSheetSelect
