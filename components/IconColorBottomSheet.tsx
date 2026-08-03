import Typo from '@/components/Typo'
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet'
import {
  Bank,
  Briefcase,
  Check,
  Coin,
  CreditCard,
  CurrencyDollar,
  HandCoins,
  House,
  PiggyBank,
  Receipt,
  Wallet,
  type Icon,
} from 'phosphor-react-native'
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react'
import { TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { BottomSheetSelectHandle } from './BottomSheetSelect'

export const ACCOUNT_ICON_OPTIONS: { name: string; icon: Icon }[] = [
  { name: 'Wallet', icon: Wallet },
  { name: 'Bank', icon: Bank },
  { name: 'CreditCard', icon: CreditCard },
  { name: 'PiggyBank', icon: PiggyBank },
  { name: 'House', icon: House },
  { name: 'CurrencyDollar', icon: CurrencyDollar },
  { name: 'Coin', icon: Coin },
  { name: 'Receipt', icon: Receipt },
  { name: 'Briefcase', icon: Briefcase },
  { name: 'HandCoins', icon: HandCoins },
]

export const ACCOUNT_COLOR_OPTIONS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#06B6D4',
  '#F97316',
  '#6366F1',
]

type IconColorBottomSheetProps = {
  icon: string
  color: string
  onChange: (next: { icon: string; color: string }) => void
}

const IconColorBottomSheet = forwardRef<BottomSheetSelectHandle, IconColorBottomSheetProps>(
  ({ icon, color, onChange }, ref) => {
    const sheetRef = useRef<BottomSheetModal>(null)
    const insets = useSafeAreaInsets()
    const snapPoints = useMemo(() => ['55%', '75%'], [])

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
        <BottomSheetScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: Math.max(insets.bottom, 20),
            gap: 20,
          }}
        >
          <Typo size={18} fontWeight="600" color="#f5f5f5">
            Icon & Color
          </Typo>

          <View>
            <Typo color="#e5e5e5" className="mb-3">
              Icon
            </Typo>
            <View className="flex-row flex-wrap gap-2">
              {ACCOUNT_ICON_OPTIONS.map((option) => {
                const IconComponent = option.icon
                const isSelected = icon === option.name

                return (
                  <TouchableOpacity
                    key={option.name}
                    onPress={() => onChange({ icon: option.name, color })}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isSelected ? color : '#262626',
                      borderWidth: isSelected ? 2 : 1,
                      borderColor: isSelected ? '#fff' : '#525252',
                    }}
                  >
                    <IconComponent size={22} color="#fff" weight={isSelected ? 'fill' : 'regular'} />
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          <View>
            <Typo color="#e5e5e5" className="mb-3">
              Color
            </Typo>
            <View className="flex-row flex-wrap gap-3">
              {ACCOUNT_COLOR_OPTIONS.map((optionColor) => {
                const isSelected = color === optionColor

                return (
                  <TouchableOpacity
                    key={optionColor}
                    onPress={() => onChange({ icon, color: optionColor })}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: optionColor,
                      borderWidth: isSelected ? 2 : 1,
                      borderColor: isSelected ? '#fff' : '#525252',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {isSelected ? <Check size={16} color="#fff" weight="bold" /> : null}
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>
    )
  }
)

IconColorBottomSheet.displayName = 'IconColorBottomSheet'

export default IconColorBottomSheet
