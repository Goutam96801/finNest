import Typo from '@/components/Typo'
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet'
import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react'
import { ActivityIndicator, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export type NestPlanChoice = 'monthly' | 'yearly'

export type NestPurchaseSheetHandle = {
  present: () => void
  dismiss: () => void
}

type NestPurchaseSheetProps = {
  loadingPlan?: NestPlanChoice | null
  onSelect: (plan: NestPlanChoice) => void
}

const PlanRow = ({
  title,
  subtitle,
  badge,
  onPress,
  loading,
}: {
  title: string
  subtitle: string
  badge?: string
  onPress: () => void
  loading?: boolean
}) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={loading}
    activeOpacity={0.85}
    className="mb-3 rounded-2xl border border-[#404040] bg-[#262626] px-4 py-4"
    style={{ opacity: loading ? 0.7 : 1 }}
  >
    <View className="flex-row items-center justify-between gap-3">
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2">
          <Typo size={16} fontWeight="700" color="#f5f5f5">
            {title}
          </Typo>
          {badge ? (
            <View className="rounded-full bg-[#a3e635]/20 px-2 py-0.5">
              <Typo size={11} fontWeight="700" color="#a3e635">
                {badge}
              </Typo>
            </View>
          ) : null}
        </View>
        <Typo size={13} color="#a3a3a3" className="mt-1">
          {subtitle}
        </Typo>
      </View>
      {loading ? <ActivityIndicator color="#a3e635" /> : null}
    </View>
  </TouchableOpacity>
)

const NestPurchaseSheet = forwardRef<NestPurchaseSheetHandle, NestPurchaseSheetProps>(
  ({ loadingPlan, onSelect }, ref) => {
    const sheetRef = useRef<BottomSheetModal>(null)
    const insets = useSafeAreaInsets()
    const snapPoints = useMemo(() => ['42%'], [])

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
        <BottomSheetView
          style={{ paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 16) }}
        >
          <Typo size={18} fontWeight="700" color="#f5f5f5">
            Upgrade to Nest
          </Typo>
          <Typo size={13} color="#a3a3a3" className="mt-1 mb-4">
            Unlock WhatsApp, sharing, Look, and more. App becomes FinNest.
          </Typo>

          <PlanRow
            title="₹99 / month"
            subtitle="Billed monthly · cancel anytime"
            loading={loadingPlan === 'monthly'}
            onPress={() => onSelect('monthly')}
          />
          <PlanRow
            title="₹999 / year"
            subtitle="≈ ₹83/month · best value"
            badge="Save"
            loading={loadingPlan === 'yearly'}
            onPress={() => onSelect('yearly')}
          />
        </BottomSheetView>
      </BottomSheetModal>
    )
  }
)

NestPurchaseSheet.displayName = 'NestPurchaseSheet'

export default NestPurchaseSheet
