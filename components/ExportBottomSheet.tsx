import Typo from '@/components/Typo'
import { showAlert } from '@/context/alertContext'
import {
  DataExport,
  generateTransactionExport,
  getExportDownloadUrl,
  listDataExports,
} from '@/lib/services/settings'
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet'
import { DownloadSimple, FileCsv, FilePdf, ArrowClockwise } from 'phosphor-react-native'
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { ActivityIndicator, Linking, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export type ExportBottomSheetHandle = {
  present: () => void
  dismiss: () => void
}

type ExportBottomSheetProps = {
  userId?: string
}

const formatDate = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const ExportBottomSheet = forwardRef<ExportBottomSheetHandle, ExportBottomSheetProps>(
  ({ userId }, ref) => {
    const sheetRef = useRef<BottomSheetModal>(null)
    const insets = useSafeAreaInsets()
    const snapPoints = useMemo(() => ['62%', '85%'], [])
    const [items, setItems] = useState<DataExport[]>([])
    const [loading, setLoading] = useState(false)
    const [generating, setGenerating] = useState<'csv' | 'pdf' | null>(null)
    const [openingId, setOpeningId] = useState<string | null>(null)

    const load = useCallback(async () => {
      if (!userId) return
      setLoading(true)
      try {
        const rows = await listDataExports(userId)
        setItems(rows)
      } catch (error) {
        console.log('Failed to load exports', error)
        showAlert('Unable to load', 'Could not load previous exports.')
      } finally {
        setLoading(false)
      }
    }, [userId])

    useImperativeHandle(ref, () => ({
      present: () => {
        sheetRef.current?.present()
        void load()
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

    const generate = async (format: 'csv' | 'pdf') => {
      setGenerating(format)
      try {
        const res = await generateTransactionExport(format)
        if (!res.success) {
          showAlert('Export failed', res.msg || 'Please try again.')
          return
        }
        await load()
        showAlert('Export ready', res.msg || `${format.toUpperCase()} saved`)
      } finally {
        setGenerating(null)
      }
    }

    const openExport = async (item: DataExport) => {
      setOpeningId(item.id)
      try {
        const res = await getExportDownloadUrl(item.storagePath)
        if (!res.success || !res.url) {
          showAlert('Unable to open', res.msg || 'Please try again.')
          return
        }
        await Linking.openURL(res.url)
      } finally {
        setOpeningId(null)
      }
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
            paddingHorizontal: 16,
            paddingBottom: Math.max(insets.bottom, 20),
          }}
        >
          <Typo size={18} fontWeight="600" color="#f5f5f5">
            Export transactions
          </Typo>
          <Typo size={13} color="#a3a3a3" className="mt-1 mb-4">
            Choose a format to generate a new file, or open a previous export.
          </Typo>

          <View className="mb-4 flex-row gap-2">
            <TouchableOpacity
              onPress={() => generate('csv')}
              disabled={Boolean(generating)}
              activeOpacity={0.85}
              className="flex-1 items-center justify-center rounded-2xl bg-[#a3e635] py-3.5"
              style={{ opacity: generating ? 0.7 : 1 }}
            >
              {generating === 'csv' ? (
                <ActivityIndicator color="#000" />
              ) : (
                <View className="flex-row items-center gap-2">
                  <FileCsv size={18} color="#000" weight="bold" />
                  <Typo fontWeight="700" color="#000">
                    CSV
                  </Typo>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => generate('pdf')}
              disabled={Boolean(generating)}
              activeOpacity={0.85}
              className="flex-1 items-center justify-center rounded-2xl border border-[#404040] bg-[#262626] py-3.5"
              style={{ opacity: generating ? 0.7 : 1 }}
            >
              {generating === 'pdf' ? (
                <ActivityIndicator color="#a3e635" />
              ) : (
                <View className="flex-row items-center gap-2">
                  <FilePdf size={18} color="#a3e635" weight="bold" />
                  <Typo fontWeight="700" color="#f5f5f5">
                    PDF
                  </Typo>
                </View>
              )}
            </TouchableOpacity>
          </View>

          <View className="mb-2 flex-row items-center justify-between">
            <Typo size={13} fontWeight="600" color="#a3a3a3">
              Your exports
            </Typo>
            <TouchableOpacity
              onPress={() => load()}
              hitSlop={10}
              className="flex-row items-center gap-1"
            >
              <ArrowClockwise size={14} color="#a3e635" weight="bold" />
              <Typo size={12} color="#a3e635" fontWeight="600">
                Refresh
              </Typo>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color="#a3e635" style={{ marginTop: 16 }} />
          ) : items.length === 0 ? (
            <Typo size={13} color="#737373" className="mt-2">
              No exports yet. Generate a CSV or PDF to get started.
            </Typo>
          ) : (
            items.map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => openExport(item)}
                activeOpacity={0.85}
                className="mb-2 flex-row items-center gap-3 rounded-2xl border border-[#404040] bg-[#262626] px-3 py-3"
              >
                <View className="h-10 w-10 items-center justify-center rounded-xl bg-[#171717]">
                  {item.format === 'pdf' ? (
                    <FilePdf size={20} color="#a3e635" weight="fill" />
                  ) : (
                    <FileCsv size={20} color="#a3e635" weight="fill" />
                  )}
                </View>
                <View className="min-w-0 flex-1">
                  <Typo fontWeight="600" color="#f5f5f5">
                    {item.format.toUpperCase()} export
                  </Typo>
                  <Typo size={12} color="#a3a3a3" className="mt-0.5">
                    {formatDate(item.createdAt)}
                  </Typo>
                </View>
                {openingId === item.id ? (
                  <ActivityIndicator color="#a3e635" />
                ) : (
                  <DownloadSimple size={18} color="#a3a3a3" weight="bold" />
                )}
              </TouchableOpacity>
            ))
          )}
        </BottomSheetScrollView>
      </BottomSheetModal>
    )
  }
)

ExportBottomSheet.displayName = 'ExportBottomSheet'

export default ExportBottomSheet
