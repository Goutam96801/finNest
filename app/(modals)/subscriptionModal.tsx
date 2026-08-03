import BackButton from '@/components/BackButton'
import BottomSheetSelect, { type BottomSheetSelectHandle } from '@/components/BottomSheetSelect'
import Button from '@/components/Button'
import DatePickerField from '@/components/DatePickerField'
import Header from '@/components/Header'
import Input from '@/components/Input'
import ModalWrapper from '@/components/ModalWrapper'
import SelectField from '@/components/SelectField'
import Typo from '@/components/Typo'
import { expenseCategories } from '@/constants/data'
import { useAuth } from '@/context/authContext'
import { getAccounts } from '@/lib/services/accounts'
import {
  createSubscription,
  SubscriptionFrequency,
} from '@/lib/services/subscriptions'
import { Account } from '@/lib/types'
import { useRouter } from 'expo-router'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { showAlert } from '@/context/alertContext'

const FREQUENCY_OPTIONS: { label: string; value: SubscriptionFrequency }[] = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Quarterly', value: 'quarterly' },
  { label: 'Yearly', value: 'yearly' },
]

const todayInputValue = () => new Date().toISOString().slice(0, 10)

const SubscriptionModal = () => {
  const { user } = useAuth()
  const router = useRouter()
  const accountSheetRef = useRef<BottomSheetSelectHandle>(null)
  const categorySheetRef = useRef<BottomSheetSelectHandle>(null)
  const frequencySheetRef = useRef<BottomSheetSelectHandle>(null)

  const [isLoading, setIsLoading] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [form, setForm] = useState({
    name: '',
    amount: '',
    accountId: '',
    category: 'others',
    frequency: 'monthly' as SubscriptionFrequency,
    nextDueDate: todayInputValue(),
    notes: '',
  })

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!user?.id) return
      const data = await getAccounts(user.id)
      if (!active) return
      setAccounts(data)
      const preferred = data.find((a) => a.isPrimary) ?? data[0]
      if (preferred?.id) {
        setForm((prev) => ({ ...prev, accountId: prev.accountId || preferred.id! }))
      }
    }
    load().catch((error) => console.log('Failed to load accounts', error))
    return () => {
      active = false
    }
  }, [user?.id])

  const accountOptions = useMemo(
    () =>
      accounts.map((account) => ({
        label: account.isPrimary
          ? `${account.name || 'Account'} · Primary`
          : account.name || 'Account',
        value: account.id || '',
      })),
    [accounts]
  )

  const categoryOptions = useMemo(
    () =>
      Object.values(expenseCategories).map((item) => ({
        label: item.label,
        value: item.value,
      })),
    []
  )

  const handleSave = async () => {
    if (!user?.id) return
    const amount = Number(form.amount)
    if (!form.name.trim()) {
      showAlert('Missing name', 'Enter a subscription name.')
      return
    }
    if (!form.accountId) {
      showAlert('Missing account', 'Select an account.')
      return
    }
    if (!(amount > 0)) {
      showAlert('Invalid amount', 'Enter an amount greater than 0.')
      return
    }

    setIsLoading(true)
    try {
      const response = await createSubscription(user.id, {
        name: form.name,
        amount,
        accountId: form.accountId,
        category: form.category,
        frequency: form.frequency,
        nextDueDate: form.nextDueDate,
        notes: form.notes.trim() || null,
      })
      if (!response.success) throw new Error(response.msg)
      showAlert('Success', response.msg || 'Subscription added')
      router.back()
    } catch (error: any) {
      showAlert('Unable to save', error?.message ?? 'Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <ModalWrapper>
      <View className="flex-1 px-5">
        <Header title="Add Subscription" leftIcon={<BackButton />} className="mb-[10px]" />
        <ScrollView contentContainerStyle={{ paddingTop: 15, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          <View className="gap-[10px]">
            <Typo color="#e5e5e5">Name</Typo>
            <Input
              placeholder="Netflix"
              value={form.name}
              onChangeText={(value) => setForm((prev) => ({ ...prev, name: value }))}
            />

            <Typo color="#e5e5e5" className="mt-2">
              Amount
            </Typo>
            <Input
              placeholder="0"
              keyboardType="numeric"
              value={form.amount}
              onChangeText={(value) => setForm((prev) => ({ ...prev, amount: value.replace(/[^0-9.]/g, '') }))}
            />

            <Typo color="#e5e5e5" className="mt-2">
              Account
            </Typo>
            <SelectField
              valueLabel={accountOptions.find((o) => o.value === form.accountId)?.label ?? ''}
              placeholder="Select account"
              onPress={() => accountSheetRef.current?.present()}
            />

            <Typo color="#e5e5e5" className="mt-2">
              Category
            </Typo>
            <SelectField
              valueLabel={categoryOptions.find((o) => o.value === form.category)?.label ?? ''}
              placeholder="Select category"
              onPress={() => categorySheetRef.current?.present()}
            />

            <Typo color="#e5e5e5" className="mt-2">
              Frequency
            </Typo>
            <SelectField
              valueLabel={FREQUENCY_OPTIONS.find((o) => o.value === form.frequency)?.label ?? ''}
              placeholder="Select frequency"
              onPress={() => frequencySheetRef.current?.present()}
            />

            <Typo color="#e5e5e5" className="mt-2">
              Next due date
            </Typo>
            <DatePickerField
              value={form.nextDueDate}
              onChange={(value) => setForm((prev) => ({ ...prev, nextDueDate: value }))}
            />

            <Typo color="#e5e5e5" className="mt-2">
              Notes
            </Typo>
            <Input
              placeholder="Optional"
              value={form.notes}
              onChangeText={(value) => setForm((prev) => ({ ...prev, notes: value }))}
            />
          </View>
        </ScrollView>
      </View>

      <View className="mt-6 mb-[5px] border-t border-[#404040] px-5 pt-[15px]">
        <Button loading={isLoading} onPress={handleSave}>
          <Typo fontWeight="700" color="#000">
            Add Subscription
          </Typo>
        </Button>
      </View>

      <BottomSheetSelect
        ref={accountSheetRef}
        title="Account"
        options={accountOptions}
        value={form.accountId}
        onChange={(value) => setForm((prev) => ({ ...prev, accountId: value }))}
      />
      <BottomSheetSelect
        ref={categorySheetRef}
        title="Category"
        options={categoryOptions}
        value={form.category}
        onChange={(value) => setForm((prev) => ({ ...prev, category: value }))}
      />
      <BottomSheetSelect
        ref={frequencySheetRef}
        title="Frequency"
        options={FREQUENCY_OPTIONS}
        value={form.frequency}
        onChange={(value) => setForm((prev) => ({ ...prev, frequency: value as SubscriptionFrequency }))}
      />
    </ModalWrapper>
  )
}

export default SubscriptionModal
