import AppRefreshControl from '@/components/AppRefreshControl'
import BackButton from '@/components/BackButton'
import BottomSheetSelect, { type BottomSheetSelectHandle } from '@/components/BottomSheetSelect'
import Button from '@/components/Button'
import ExportBottomSheet, { type ExportBottomSheetHandle } from '@/components/ExportBottomSheet'
import Header from '@/components/Header'
import Input from '@/components/Input'
import Loading from '@/components/Loading'
import ScreenWrapper from '@/components/ScreenWrapper'
import { SettingsGroup, SettingsRow, SettingsSwitch } from '@/components/SettingsGroup'
import Typo from '@/components/Typo'
import { showAlert } from '@/context/alertContext'
import { useAuth } from '@/context/authContext'
import { usePrefs } from '@/context/prefsContext'
import { logout } from '@/lib/services/auth'
import { getProfileImage } from '@/lib/services/image-service'
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
import * as Haptics from 'expo-haptics'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import * as Icons from 'phosphor-react-native'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { FadeInDown } from 'react-native-reanimated'

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
}) => {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        className="flex-1 justify-end bg-black/70"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity className="flex-1" activeOpacity={1} onPress={onClose} />
        <View
          className="rounded-t-3xl bg-[#171717] px-5 pt-4"
          style={{ paddingBottom: Math.max(insets.bottom, 24) }}
        >
          <View className="mb-1 h-1 w-10 self-center rounded-full bg-[#404040]" />
          <View className="mb-4 mt-3 flex-row items-center justify-between">
            <Typo size={18} fontWeight="600" color="#f5f5f5">
              {title}
            </Typo>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Icons.X size={22} color="#a3a3a3" weight="bold" />
            </TouchableOpacity>
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const SettingsScreen = () => {
  const { user } = useAuth()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { balanceVisible, setBalanceVisible, weekStartsOn, setWeekStartsOn } = usePrefs()
  const weekSheetRef = useRef<BottomSheetSelectHandle>(null)
  const exportSheetRef = useRef<ExportBottomSheetHandle>(null)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
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
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [rating, setRating] = useState(5)
  const [submitting, setSubmitting] = useState(false)

  const appVersion = Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? '1.0.0'
  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.display_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    'Your profile'
  const weekLabel = WEEKDAY_OPTIONS.find((item) => item.value === weekStartsOn)?.label ?? 'Sunday'

  const load = useCallback(async () => {
    if (!user?.id) return
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
    void load()
  }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await load()
    } finally {
      setRefreshing(false)
    }
  }, [load])

  const saveNotif = async (next: NotificationSettings) => {
    if (!user?.id) return
    void Haptics.selectionAsync()
    setNotif(next)
    setSavingNotif(true)
    try {
      const res = await updateNotificationSettings(user.id, next)
      if (!res.success) {
        showAlert('Unable to save', res.msg || 'Please try again.')
        await load()
      }
    } finally {
      setSavingNotif(false)
    }
  }

  const commitThreshold = () => {
    const amount = Number(thresholdText.replace(/,/g, ''))
    if (!Number.isFinite(amount) || amount < 0) {
      setThresholdText(String(notif.lowBalanceThreshold ?? 5000))
      return
    }
    const rounded = Math.round(amount)
    setThresholdText(String(rounded))
    if (rounded !== Number(notif.lowBalanceThreshold)) {
      void saveNotif({ ...notif, lowBalanceThreshold: rounded })
    }
  }

  const showLogoutAlert = () => {
    showAlert('Sign out?', 'You can sign back in anytime with the same account.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: logout },
    ])
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
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 28) }}
            refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          >
            <Animated.View entering={FadeInDown.delay(0).springify().damping(40).stiffness(200)}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => router.push('/(modals)/profileModal')}
                className="mb-5 flex-row items-center gap-3.5 rounded-2xl border border-[#404040] bg-[#171717] px-3.5 py-3.5"
              >
                <Image
                  source={getProfileImage(user?.user_metadata?.avatar_url || user?.user_metadata?.avatar)}
                  contentFit="cover"
                  style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#404040' }}
                />
                <View className="min-w-0 flex-1">
                  <Typo size={16} fontWeight="600" color="#f5f5f5" textProps={{ numberOfLines: 1 }}>
                    {displayName}
                  </Typo>
                  <Typo size={13} color="#a3a3a3" className="mt-0.5" textProps={{ numberOfLines: 1 }}>
                    {user?.email || 'Edit your profile'}
                  </Typo>
                </View>
                <Icons.CaretRight size={verticalScale(18)} color="#a3a3a3" weight="bold" />
              </TouchableOpacity>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(40).springify().damping(40).stiffness(200)}>
              <SettingsGroup label="Preferences">
                <SettingsRow
                  title="Hide balances"
                  subtitle="Hidden by default when you open the app"
                  icon={<Icons.EyeSlash size={20} color="#fff" weight="fill" />}
                  bgColor="#525252"
                  right={
                    <SettingsSwitch
                      value={!balanceVisible}
                      onValueChange={(hidden) => {
                        void Haptics.selectionAsync()
                        setBalanceVisible(!hidden)
                      }}
                    />
                  }
                />
                <SettingsRow
                  title="Start of week"
                  subtitle={weekLabel}
                  icon={<Icons.CalendarBlank size={20} color="#fff" weight="fill" />}
                  bgColor="#2563eb"
                  onPress={() => weekSheetRef.current?.present()}
                />
              </SettingsGroup>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(80).springify().damping(40).stiffness(200)}>
              <SettingsGroup label="Notifications">
                <SettingsRow
                  title="Notification inbox"
                  subtitle="Reminders, balances, and updates"
                  icon={<Icons.Tray size={20} color="#fff" weight="fill" />}
                  bgColor="#3f6212"
                  onPress={() => router.push('/(modals)/notificationsModal')}
                />
                <SettingsRow
                  title="Subscription reminders"
                  subtitle="Day before and due date · 9:00 AM"
                  icon={<Icons.Bell size={20} color="#fff" weight="fill" />}
                  bgColor="#7c3aed"
                  right={
                    <SettingsSwitch
                      value={notif.subscriptionRemindersEnabled}
                      disabled={savingNotif}
                      onValueChange={(value) =>
                        saveNotif({ ...notif, subscriptionRemindersEnabled: value })
                      }
                    />
                  }
                />
                <SettingsRow
                  title="Low balance alerts"
                  subtitle={
                    notif.lowBalanceAlertsEnabled
                      ? `Alert under ₹${Number(notif.lowBalanceThreshold ?? 0).toLocaleString('en-IN')}`
                      : 'Off'
                  }
                  icon={<Icons.Warning size={20} color="#fff" weight="fill" />}
                  bgColor="#d97706"
                  right={
                    <SettingsSwitch
                      value={notif.lowBalanceAlertsEnabled}
                      disabled={savingNotif}
                      onValueChange={(value) =>
                        saveNotif({ ...notif, lowBalanceAlertsEnabled: value })
                      }
                    />
                  }
                />
              </SettingsGroup>
              {notif.lowBalanceAlertsEnabled ? (
                <View className="-mt-3 mb-5 rounded-2xl border border-[#404040] bg-[#171717] px-3.5 py-3.5">
                  <Typo size={13} fontWeight="600" color="#f5f5f5">
                    Alert threshold
                  </Typo>
                  <Typo size={12} color="#a3a3a3" className="mt-1 mb-3">
                    We’ll notify you when a bank, cash, or wallet drops below this amount.
                  </Typo>
                  <Input
                    value={thresholdText}
                    onChangeText={setThresholdText}
                    keyboardType="numeric"
                    placeholder="5000"
                    icon={<Typo size={16} fontWeight="600" color="#a3a3a3">₹</Typo>}
                    onBlur={commitThreshold}
                  />
                </View>
              ) : null}
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(120).springify().damping(40).stiffness(200)}>
              <SettingsGroup label="Data">
                <SettingsRow
                  title="Export transactions"
                  subtitle="CSV or PDF · saved in the app"
                  icon={<Icons.DownloadSimple size={20} color="#fff" weight="bold" />}
                  bgColor="#0d9488"
                  onPress={() => exportSheetRef.current?.present()}
                />
              </SettingsGroup>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(160).springify().damping(40).stiffness(200)}>
              <SettingsGroup label="Account">
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
                  subtitle="At least 6 characters"
                  icon={<Icons.Key size={20} color="#fff" weight="fill" />}
                  bgColor="#0891b2"
                  onPress={() => {
                    setPasswordValue('')
                    setPasswordConfirm('')
                    setShowPassword(false)
                    setPasswordModal(true)
                  }}
                />
                <SettingsRow
                  title="Sign out"
                  icon={<Icons.SignOut size={20} color="#fff" weight="bold" />}
                  bgColor="#525252"
                  onPress={showLogoutAlert}
                />
                <SettingsRow
                  title="Delete account"
                  subtitle="90 days to request reactivation"
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
              </SettingsGroup>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(200).springify().damping(40).stiffness(200)}>
              <SettingsGroup label="Support">
                <SettingsRow
                  title="Contact support"
                  subtitle="We usually reply by email"
                  icon={<Icons.ChatCircleText size={20} color="#fff" weight="fill" />}
                  bgColor="#16a34a"
                  onPress={() => {
                    setFeedbackMessage('')
                    setFeedbackModal('contact')
                  }}
                />
                <SettingsRow
                  title="Rate FinNest"
                  subtitle="Tell us how we’re doing"
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
                  subtitle="Ideas and bugs welcome"
                  icon={<Icons.NotePencil size={20} color="#fff" weight="fill" />}
                  bgColor="#9333ea"
                  onPress={() => {
                    setFeedbackMessage('')
                    setFeedbackModal('feedback')
                  }}
                />
              </SettingsGroup>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(240).springify().damping(40).stiffness(200)}>
              <SettingsGroup label="About">
                <SettingsRow
                  title="Privacy policy"
                  icon={<Icons.Lock size={20} color="#fff" weight="fill" />}
                  bgColor="#6366f1"
                  onPress={() => router.push('/(modals)/privacyPolicy')}
                />
                <SettingsRow
                  title="App version"
                  subtitle={`FinNest ${appVersion}`}
                  icon={<Icons.Tag size={20} color="#fff" weight="bold" />}
                  bgColor="#404040"
                />
              </SettingsGroup>
            </Animated.View>
          </ScrollView>
        )}
      </View>

      <FormModal visible={emailModal} title="Change email" onClose={() => setEmailModal(false)}>
        <Typo size={13} color="#a3a3a3" className="mb-3">
          We’ll send a confirmation link to the new address.
        </Typo>
        <Input
          placeholder="new@email.com"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          value={emailValue}
          onChangeText={setEmailValue}
        />
        <View className="mt-4">
          <Button
            loading={submitting}
            onPress={async () => {
              const email = emailValue.trim()
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                showAlert('Invalid email', 'Enter a valid email address.')
                return
              }
              setSubmitting(true)
              const res = await changeEmail(email)
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
          secureTextEntry={!showPassword}
          value={passwordValue}
          onChangeText={setPasswordValue}
          icon={
            <TouchableOpacity onPress={() => setShowPassword((current) => !current)} hitSlop={8}>
              {showPassword ? (
                <Icons.EyeSlash size={18} color="#a3a3a3" />
              ) : (
                <Icons.Eye size={18} color="#a3a3a3" />
              )}
            </TouchableOpacity>
          }
        />
        <View className="mt-3">
          <Input
            placeholder="Confirm password"
            secureTextEntry={!showPassword}
            value={passwordConfirm}
            onChangeText={setPasswordConfirm}
          />
        </View>
        <View className="mt-4">
          <Button
            loading={submitting}
            onPress={async () => {
              if (passwordValue.trim().length < 6) {
                showAlert('Too short', 'Password must be at least 6 characters.')
                return
              }
              if (passwordValue !== passwordConfirm) {
                showAlert('Doesn’t match', 'The passwords you entered don’t match.')
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
              <TouchableOpacity
                key={value}
                onPress={() => {
                  void Haptics.selectionAsync()
                  setRating(value)
                }}
                hitSlop={6}
              >
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
