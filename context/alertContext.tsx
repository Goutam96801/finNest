import Typo from '@/components/Typo'
import { colors, radius } from '@/constants/theme'
import { X } from 'phosphor-react-native'
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native'

export type AppAlertButton = {
  text: string
  onPress?: () => void | Promise<void>
  style?: 'default' | 'cancel' | 'destructive' | 'primary'
}

export type AppAlertOptions = {
  title: string
  message?: string
  buttons?: AppAlertButton[]
  /** Show X and allow backdrop dismiss. Default true. */
  dismissible?: boolean
}

type AlertContextValue = {
  alert: (options: AppAlertOptions) => void
}

const AlertContext = createContext<AlertContextValue | null>(null)

type AlertHandler = (options: AppAlertOptions) => void

let externalAlert: AlertHandler | null = null

/** Drop-in replacement for React Native Alert.alert */
export function showAlert(
  title: string,
  message?: string,
  buttons?: AppAlertButton[]
) {
  externalAlert?.({ title, message, buttons })
}

export function useAppAlert() {
  const ctx = useContext(AlertContext)
  if (!ctx) {
    throw new Error('useAppAlert must be used within AlertProvider')
  }
  return ctx
}

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false)
  const [options, setOptions] = useState<AppAlertOptions | null>(null)
  const [busy, setBusy] = useState(false)
  const optionsRef = useRef<AppAlertOptions | null>(null)

  const hide = useCallback(() => {
    setVisible(false)
    setBusy(false)
    setOptions(null)
    optionsRef.current = null
  }, [])

  const alert = useCallback((next: AppAlertOptions) => {
    optionsRef.current = next
    setOptions(next)
    setVisible(true)
  }, [])

  React.useEffect(() => {
    externalAlert = alert
    return () => {
      if (externalAlert === alert) externalAlert = null
    }
  }, [alert])

  const dismissible = options?.dismissible !== false
  const buttons = options?.buttons?.length
    ? options.buttons
    : ([{ text: 'OK', style: 'primary' }] as AppAlertButton[])

  const handleButton = async (button: AppAlertButton) => {
    if (busy) return
    setBusy(true)
    const action = button.onPress
    hide()
    // Defer so a follow-up showAlert inside onPress is not cleared by hide()
    if (action) {
      setTimeout(() => {
        void action()
      }, 10)
    }
  }

  const value = useMemo(() => ({ alert }), [alert])

  return (
    <AlertContext.Provider value={value}>
      {children}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (dismissible && !busy) hide()
        }}
      >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (dismissible && !busy) hide()
            }}
          />

          <View style={styles.card}>
            <View style={styles.header}>
              <Typo size={18} fontWeight="700" color={colors.neutral100} className="flex-1 pr-3">
                {options?.title}
              </Typo>
              {dismissible ? (
                <TouchableOpacity
                  onPress={hide}
                  disabled={busy}
                  hitSlop={12}
                  activeOpacity={0.7}
                  style={styles.closeBtn}
                >
                  <X size={18} color={colors.neutral100} weight="bold" />
                </TouchableOpacity>
              ) : null}
            </View>

            {options?.message ? (
              <Typo size={14} color={colors.neutral400} className="mt-2">
                {options.message}
              </Typo>
            ) : null}

            <View style={styles.actions}>
              {buttons.map((button, index) => {
                const variant = button.style ?? (index === buttons.length - 1 ? 'primary' : 'default')
                const bg =
                  variant === 'primary'
                    ? colors.primary
                    : variant === 'destructive'
                      ? colors.rose
                      : variant === 'cancel'
                        ? colors.neutral700
                        : colors.neutral800
                const textColor =
                  variant === 'primary' || variant === 'destructive' ? colors.black : colors.neutral100
                const finalTextColor = variant === 'destructive' ? colors.white : textColor

                return (
                  <TouchableOpacity
                    key={`${button.text}-${index}`}
                    activeOpacity={0.85}
                    disabled={busy}
                    onPress={() => handleButton(button)}
                    style={[styles.actionBtn, { backgroundColor: bg, opacity: busy ? 0.7 : 1 }]}
                  >
                    <Typo size={15} fontWeight="600" color={finalTextColor}>
                      {button.text}
                    </Typo>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        </View>
      </Modal>
    </AlertContext.Provider>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: colors.neutral900,
    borderRadius: radius._20,
    borderWidth: 1,
    borderColor: colors.neutral700,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.neutral700,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    marginTop: 18,
    gap: 10,
  },
  actionBtn: {
    minHeight: 48,
    borderRadius: radius._15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
})
