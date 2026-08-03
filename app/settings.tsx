import BackButton from '@/components/BackButton'
import BottomSheetSelect, { type BottomSheetSelectHandle } from '@/components/BottomSheetSelect'
import Button from '@/components/Button'
import ExportBottomSheet, { type ExportBottomSheetHandle } from '@/components/ExportBottomSheet'
import Header from '@/components/Header'
import Input from '@/components/Input'
import Loading from '@/components/Loading'
import ScreenWrapper from '@/components/ScreenWrapper'
import Typo from '@/components/Typo'
import { showAlert } from '@/context/alertContext'
import { useAuth } from '@/context/authContext'
import { usePrefs } from '@/context/prefsContext'
import { logout } from '@/lib/services/auth'
import { WEEKDAY_OPTIONS, type WeekStartsOn } from '@/lib/prefs/devicePrefs'
import {
  changeEmail,
  changePassword,
  getNotificationSettings,
  requestAccountDeletion,
  submitFeedback,
  updateNotificationSettings,
  type FeedbackType,
  type NotificationSettings,
} from '@/lib/services/settings'
import { verticalScale } from '@/utils/styling'
import Constants from 'expo-constants'
import * as Icons from 'phosphor-react-native'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Switch,
  TouchableOpacity,
  View,
} from 'react-native'

type SettingsRowProps = {
  title: string
  subtitle?: string
  icon: React.ReactNode
  bgColor: string
  onPress?: () => void
  right?: React.ReactNode
  danger?: boolean
}

const SettingsRow = ({
  title,
  subtitle,
  icon,
  bgColor,
  onPress,
  right,
  danger,
}: SettingsRowProps) => (
  <TouchableOpacity
    disabled={!onPress}
    onPress={onPress}
    activeOpacity={0.85}
    className="mb-3 flex-row items-center gap-3 rounded-2xl border border-[#404040] bg-[#171717] px-3 py-3"
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
      (onPress ? <Icons.CaretRight size={verticalScale(18)} color="#a3a3a3" weight="bold" /> : null)}
  </TouchableOpacity>
)

const SectionLabel = ({ children }: { children: string }) => (
  <Typo size={13} fontWeight="600" color="#a3a3a3" className="mb-2 mt-4">
    {children}
  </Typo>
)

const FormModal = ({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View className="flex-1 justify-end bg-black/70">
      <View className="rounded-t-3xl bg-[#171717] px-5 pb-8 pt-4">
        <View className="mb-4 flex-row items-center justify-between">
          <Typo size={18} fontWeight="600" color="#f5f5f5">
            {title}
          </Typo>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Icons.X size={22} color="#a3a3a3" weight="bold" />
          </TouchableOpacity>
        </View>
        {children}
      </View>
    </View>
  </Modal>
)

const SettingsScreen = () => {
  const { user } = useAuth()
  const { balanceVisible, setBalanceVisible, weekStartsOn, setWeekStartsOn } = usePrefs()
  const weekSheetRef = useRef<BottomSheetSelectHandle>(null)
  const exportSheetRef = useRef<ExportBottomSheetHandle>(null)

  const [loading, setLoading] = useState(true)
  const [savingNotif, setSavingNotif] = useState(false)
  const [notif, setNotif] = useState<NotificationSettings>({
    subscriptionRemindersEnabled: true,
    lowBalanceAlertsEnabled: true,
    lowBalanceThreshold: 5000,
  })
  const [thresholdText, setThresholdText] = useState('5000')

  const [emailModal, setEmailModal] = useState(false)
  const [passwordModal, setPasswordModal] = useState(false)
  const [feedbackModal, setFeedbackModal] = useState<FeedbackType | null>(null)
  const [emailValue, setEmailValue] = useState('')
  const [passwordValue, setPasswordValue] = useState('')
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [rating, setRating] = useState(5)
  const [submitting, setSubmitting] = useState(false)

  const appVersion =
    Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? '1.0.0'

  const load = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      const settings = await getNotificationSettings(user.id)
      setNotif(settings)
      setThresholdText(String(settings.lowBalanceThreshold ?? 5000))
    } catch (error) {
      console.log('Failed to load settings', error)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    load()
  }, [load])

  const saveNotif = async (next: NotificationSettings) => {
    if (!user?.id) return
    setNotif(next)
    setSavingNotif(true)
    try {
      const res = await updateNotificationSettings(user.id, next)
      if (!res.success) showAlert('Unable to save', res.msg || 'Please try again.')
    } finally {
      setSavingNotif(false)
    }
  }

  return (
    <ScreenWrapper style={{ backgroundColor: '#000' }}>
      <View className="flex-1 px-5">
        <Header title="Settings" leftIcon={<BackButton />} className="mb-2" />

        {loading ? (
          <Loading />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}
          >
            <SectionLabel>Preferences</SectionLabel>
            <SettingsRow
              title="Hide balances"
              subtitle="Remember home eye preference"
              icon={<Icons.EyeSlash size={20} color="#fff" weight="fill" />}
              bgColor="#525252"
              right={
                <Switch
                  value={!balanceVisible}
                  onValueChange={(hidden) => setBalanceVisible(!hidden)}
                  trackColor={{ false: '#404040', true: '#a3e635' }}
                  thumbColor="#f5f5f5"
                />
              }
            />
            <SettingsRow
              title="Start of week"
              subtitle={
                WEEKDAY_OPTIONS.find((item) => item.value === weekStartsOn)?.label ?? 'Sunday'
              }
              icon={<Icons.CalendarBlank size={20} color="#fff" weight="fill" />}
              bgColor="#2563eb"
              onPress={() => weekSheetRef.current?.present()}
            />

            <SectionLabel>Notifications</SectionLabel>
            <SettingsRow
              title="Subscription reminders"
              subtitle="Due / snooze alerts"
              icon={<Icons.Bell size={20} color="#fff" weight="fill" />}
              bgColor="#7c3aed"
              right={
                <Switch
                  value={notif.subscriptionRemindersEnabled}
                  onValueChange={(value) =>
                    saveNotif({ ...notif, subscriptionRemindersEnabled: value })
                  }
                  trackColor={{ false: '#404040', true: '#a3e635' }}
                  thumbColor="#f5f5f5"
                />
              }
            />
            <SettingsRow
              title="Low balance alerts"
              subtitle={
                notif.lowBalanceAlertsEnabled
                  ? `Threshold ₹${Number(notif.lowBalanceThreshold ?? 0).toLocaleString('en-IN')}`
                  : 'Off'
              }
              icon={<Icons.Warning size={20} color="#fff" weight="fill" />}
              bgColor="#d97706"
              right={
                <Switch
                  value={notif.lowBalanceAlertsEnabled}
                  onValueChange={(value) =>
                    saveNotif({ ...notif, lowBalanceAlertsEnabled: value })
                  }
                  trackColor={{ false: '#404040', true: '#a3e635' }}
                  thumbColor="#f5f5f5"
                />
              }
            />
            {notif.lowBalanceAlertsEnabled ? (
              <View className="mb-3 rounded-2xl border border-[#404040] bg-[#171717] px-3 py-3">
                <Typo size={13} color="#a3a3a3" className="mb-2">
                  Low balance threshold (₹)
                </Typo>
                <Input
                  value={thresholdText}
                  onChangeText={setThresholdText}
                  keyboardType="numeric"
                  placeholder="5000"
                  onBlur={() => {
                    const amount = Number(thresholdText)
                    if (!Number.isFinite(amount) || amount < 0) {
                      setThresholdText(String(notif.lowBalanceThreshold ?? 5000))
                      return
                    }
                    saveNotif({ ...notif, lowBalanceThreshold: amount })
                  }}
                />
                {savingNotif ? (
                  <ActivityIndicator color="#a3e635" style={{ marginTop: 8 }} />
                ) : null}
              </View>
            ) : null}

            <SectionLabel>Data</SectionLabel>
            <SettingsRow
              title="Export transactions"
              subtitle="CSV or PDF · download from the app"
              icon={<Icons.DownloadSimple size={20} color="#fff" weight="bold" />}
              bgColor="#0d9488"
              onPress={() => exportSheetRef.current?.present()}
            />

            <SectionLabel>Account</SectionLabel>
            <SettingsRow
              title="Change email"
              subtitle={user?.email || undefined}
              icon={<Icons.EnvelopeSimple size={20} color="#fff" weight="fill" />}
              bgColor="#4f46e5"
              onPress={() => {
                setEmailValue(user?.email || '')
                setEmailModal(true)
              }}
            />
            <SettingsRow
              title="Change password"
              icon={<Icons.Key size={20} color="#fff" weight="fill" />}
              bgColor="#0891b2"
              onPress={() => {
                setPasswordValue('')
                setPasswordModal(true)
              }}
            />
            <SettingsRow
              title="Delete account"
              icon={<Icons.Trash size={20} color="#fff" weight="fill" />}
              bgColor="#e11d48"
              danger
              onPress={() => {
                showAlert(
                  'Delete account?',
                  'Your account will be deactivated right away. If you change your mind, email support@finnest.app within 90 days to request reactivation. After 90 days, your account and data will be permanently deleted.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete account',
                      style: 'destructive',
                      onPress: async () => {
                        const res = await requestAccountDeletion()
                        if (!res.success) {
                          showAlert('Unable to delete', res.msg || 'Please try again.')
                          return
                        }
                        showAlert('Account deleted', res.msg || 'Signed out')
                        await logout()
                      },
                    },
                  ]
                )
              }}
            />

            <SectionLabel>Support</SectionLabel>
            <SettingsRow
              title="Contact support"
              icon={<Icons.ChatCircleText size={20} color="#fff" weight="fill" />}
              bgColor="#16a34a"
              onPress={() => {
                setFeedbackMessage('')
                setFeedbackModal('contact')
              }}
            />
            <SettingsRow
              title="Rate FinNest"
              icon={<Icons.Star size={20} color="#fff" weight="fill" />}
              bgColor="#ca8a04"
              onPress={() => {
                setFeedbackMessage('')
                setRating(5)
                setFeedbackModal('rate')
              }}
            />
            <SettingsRow
              title="Send feedback"
              icon={<Icons.NotePencil size={20} color="#fff" weight="fill" />}
              bgColor="#9333ea"
              onPress={() => {
                setFeedbackMessage('')
                setFeedbackModal('feedback')
              }}
            />
          </ScrollView>
        )}

        <View className="items-center justify-center pb-2 pt-3">
          <View className="flex-row items-center gap-1.5">
            <Icons.Tag size={14} color="#737373" weight="bold" />
            <Typo size={12} color="#737373">
              Version {appVersion}
            </Typo>
          </View>
        </View>
      </View>

      <FormModal visible={emailModal} title="Change email" onClose={() => setEmailModal(false)}>
        <Input
          placeholder="new@email.com"
          autoCapitalize="none"
          keyboardType="email-address"
          value={emailValue}
          onChangeText={setEmailValue}
        />
        <View className="mt-4">
          <Button
            loading={submitting}
            onPress={async () => {
              setSubmitting(true)
              const res = await changeEmail(emailValue)
              setSubmitting(false)
              if (!res.success) {
                showAlert('Unable to update', res.msg || 'Please try again.')
                return
              }
              setEmailModal(false)
              showAlert('Check your inbox', res.msg || 'Confirm the new email')
            }}
          >
            <Typo fontWeight="700" color="#000">
              Update email
            </Typo>
          </Button>
        </View>
      </FormModal>

      <FormModal
        visible={passwordModal}
        title="Change password"
        onClose={() => setPasswordModal(false)}
      >
        <Input
          placeholder="New password"
          secureTextEntry
          value={passwordValue}
          onChangeText={setPasswordValue}
        />
        <View className="mt-4">
          <Button
            loading={submitting}
            onPress={async () => {
              if (passwordValue.trim().length < 6) {
                showAlert('Too short', 'Password must be at least 6 characters.')
                return
              }
              setSubmitting(true)
              const res = await changePassword(passwordValue.trim())
              setSubmitting(false)
              if (!res.success) {
                showAlert('Unable to update', res.msg || 'Please try again.')
                return
              }
              setPasswordModal(false)
              showAlert('Done', res.msg || 'Password updated')
            }}
          >
            <Typo fontWeight="700" color="#000">
              Update password
            </Typo>
          </Button>
        </View>
      </FormModal>

      <FormModal
        visible={Boolean(feedbackModal)}
        title={
          feedbackModal === 'contact'
            ? 'Contact support'
            : feedbackModal === 'rate'
              ? 'Rate FinNest'
              : 'Send feedback'
        }
        onClose={() => setFeedbackModal(null)}
      >
        {feedbackModal === 'rate' ? (
          <View className="mb-3 flex-row justify-center gap-2">
            {[1, 2, 3, 4, 5].map((value) => (
              <TouchableOpacity key={value} onPress={() => setRating(value)} hitSlop={6}>
                <Icons.Star
                  size={28}
                  color={value <= rating ? '#a3e635' : '#525252'}
                  weight={value <= rating ? 'fill' : 'regular'}
                />
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        <Input
          placeholder={
            feedbackModal === 'contact'
              ? 'How can we help?'
              : feedbackModal === 'rate'
                ? 'Optional comment'
                : 'Share your thoughts'
          }
          value={feedbackMessage}
          onChangeText={setFeedbackMessage}
          multiline
          style={{ minHeight: 90, textAlignVertical: 'top' }}
        />
        <View className="mt-4">
          <Button
            loading={submitting}
            onPress={async () => {
              if (!user?.id || !feedbackModal) return
              if (feedbackModal !== 'rate' && !feedbackMessage.trim()) {
                showAlert('Missing message', 'Please enter a message.')
                return
              }
              setSubmitting(true)
              const res = await submitFeedback(user.id, {
                type: feedbackModal,
                message: feedbackMessage,
                rating: feedbackModal === 'rate' ? rating : undefined,
              })
              setSubmitting(false)
              if (!res.success) {
                showAlert('Unable to send', res.msg || 'Please try again.')
                return
              }
              setFeedbackModal(null)
              showAlert('Thank you', res.msg || 'Submitted')
            }}
          >
            <Typo fontWeight="700" color="#000">
              Submit
            </Typo>
          </Button>
        </View>
      </FormModal>

      <BottomSheetSelect
        ref={weekSheetRef}
        title="Start of week"
        options={WEEKDAY_OPTIONS.map((item) => ({
          label: item.label,
          value: String(item.value),
        }))}
        value={String(weekStartsOn)}
        onChange={(value) => setWeekStartsOn(Number(value) as WeekStartsOn)}
      />

      <ExportBottomSheet ref={exportSheetRef} userId={user?.id} />
    </ScreenWrapper>
  )
}

export default SettingsScreen
