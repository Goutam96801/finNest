import BackButton from '@/components/BackButton'
import BottomSheetSelect, { type BottomSheetSelectHandle } from '@/components/BottomSheetSelect'
import Button from '@/components/Button'
import DatePickerField from '@/components/DatePickerField'
import Header from '@/components/Header'
import Input from '@/components/Input'
import Loading from '@/components/Loading'
import ModalWrapper from '@/components/ModalWrapper'
import SelectField from '@/components/SelectField'
import Typo from '@/components/Typo'
import { expenseCategories, incomeCategory, transactionTypes } from '@/constants/data'
import { showAlert } from '@/context/alertContext'
import { useAuth } from '@/context/authContext'
import { getAccounts } from '@/lib/services/accounts'
import {
  createTransaction,
  deleteTransaction,
  getTransactionById,
  updateTransaction,
} from '@/lib/services/transactions'
import { Account } from '@/lib/types'
import { TransactionType } from '@/types'
import { verticalScale } from '@/utils/styling'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Trash } from 'phosphor-react-native'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, TouchableOpacity, View } from 'react-native'

const todayInputValue = () => new Date().toISOString().slice(0, 10)

const toDateInput = (value: TransactionType['date']) => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return todayInputValue()
  return date.toISOString().slice(0, 10)
}

const TransactionModal = () => {
  const { user } = useAuth()
  const router = useRouter()
  const params = useLocalSearchParams<{ id?: string }>()
  const transactionId = typeof params.id === 'string' ? params.id : undefined
  const isEditing = Boolean(transactionId)

  const typeSheetRef = useRef<BottomSheetSelectHandle>(null)
  const categorySheetRef = useRef<BottomSheetSelectHandle>(null)
  const accountSheetRef = useRef<BottomSheetSelectHandle>(null)
  const toAccountSheetRef = useRef<BottomSheetSelectHandle>(null)

  const [isLoading, setIsLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(isEditing)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [form, setForm] = useState<{
    type: TransactionType['type']
    category: string
    accountId: string
    toAccountId: string
    amount: string
    date: string
    notes: string
  }>({
    type: 'expense',
    category: 'utilities',
    accountId: '',
    toAccountId: '',
    amount: '',
    date: todayInputValue(),
    notes: '',
  })

  useEffect(() => {
    let active = true

    const load = async () => {
      if (!user?.id) return

      try {
        const accountRows = await getAccounts(user.id)
        if (!active) return
        setAccounts(accountRows)

        if (isEditing && transactionId) {
          setIsFetching(true)
          const txn = await getTransactionById(user.id, transactionId)
          if (!active) return
          setForm({
            type: txn.type,
            category:
              txn.type === 'income'
                ? incomeCategory.value
                : txn.category || 'others',
            accountId: txn.accountId || '',
            toAccountId: txn.toAccountId || '',
            amount: String(txn.amount ?? ''),
            date: toDateInput(txn.date),
            notes: (txn.notes || txn.description || '').toString(),
          })
        } else {
          const preferred = accountRows.find((account) => account.isPrimary) ?? accountRows[0]
          if (preferred?.id) {
            setForm((prev) => ({ ...prev, accountId: prev.accountId || preferred.id! }))
          }
        }
      } catch (error) {
        console.log('Failed to load transaction modal', error)
        if (isEditing) {
          showAlert('Unable to load', 'Could not load this transaction.')
          router.back()
        }
      } finally {
        if (active) setIsFetching(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [user?.id, isEditing, transactionId])

  const typeOptions = useMemo(() => transactionTypes, [])

  const categoryOptions = useMemo(() => {
    if (form.type === 'income') {
      return [{ label: incomeCategory.label, value: incomeCategory.value }]
    }
    return Object.values(expenseCategories).map((item) => ({
      label: item.label,
      value: item.value,
    }))
  }, [form.type])

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

  const toAccountOptions = useMemo(
    () => accountOptions.filter((option) => option.value && option.value !== form.accountId),
    [accountOptions, form.accountId]
  )

  const isTransfer = form.type === 'transfer'
  const typeLabel = typeOptions.find((item) => item.value === form.type)?.label ?? ''
  const categoryLabel = categoryOptions.find((item) => item.value === form.category)?.label ?? ''
  const accountLabel = accountOptions.find((item) => item.value === form.accountId)?.label ?? ''
  const toAccountLabel = toAccountOptions.find((item) => item.value === form.toAccountId)?.label ?? ''

  const buildPayload = () => {
    const amount = Number(form.amount)
    return {
      type: form.type,
      category: isTransfer
        ? null
        : form.type === 'income'
          ? incomeCategory.value
          : form.category,
      accountId: form.accountId,
      toAccountId: isTransfer ? form.toAccountId : null,
      amount,
      notes: form.notes.trim() || null,
      description: form.notes.trim() || null,
      date: new Date(`${form.date}T12:00:00`).toISOString(),
      status: 'completed' as const,
    }
  }

  const handleSave = async () => {
    if (!user?.id) {
      showAlert('Sign in required', 'Please sign in before saving a transaction.')
      return
    }

    if (!form.accountId) {
      showAlert('Missing account', 'Please select an account.')
      return
    }

    if (isTransfer && !form.toAccountId) {
      showAlert('Missing account', 'Please select a destination account.')
      return
    }

    const amount = Number(form.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      showAlert('Invalid amount', 'Enter an amount greater than 0.')
      return
    }

    if (!form.date) {
      showAlert('Missing date', 'Please enter a date (YYYY-MM-DD).')
      return
    }

    setIsLoading(true)
    try {
      const payload = buildPayload()
      const response =
        isEditing && transactionId
          ? await updateTransaction(user.id, transactionId, payload)
          : await createTransaction(user.id, payload)

      if (!response.success) {
        throw new Error(response.msg || 'Unable to save transaction')
      }

      showAlert('Success', response.msg || (isEditing ? 'Transaction updated.' : 'Transaction added.'))
      router.back()
    } catch (error: any) {
      showAlert('Unable to save transaction', error?.message ?? 'Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = () => {
    if (!user?.id || !transactionId) return

    showAlert('Delete transaction', 'Are you sure you want to delete this transaction?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setIsLoading(true)
          try {
            const response = await deleteTransaction(user.id, transactionId)
            if (!response.success) {
              throw new Error(response.msg || 'Unable to delete transaction')
            }
            showAlert('Success', response.msg || 'Transaction deleted.')
            router.back()
          } catch (error: any) {
            showAlert('Unable to delete', error?.message ?? 'Please try again.')
          } finally {
            setIsLoading(false)
          }
        },
      },
    ])
  }

  return (
    <ModalWrapper>
      <View className="flex-1 px-5">
        <Header
          title={isEditing ? 'Update Transaction' : 'Add Transaction'}
          leftIcon={<BackButton />}
          rightIcon={
            isEditing ? (
              <TouchableOpacity onPress={handleDelete} hitSlop={12} disabled={isLoading || isFetching}>
                <Trash size={verticalScale(22)} color="#ef4444" weight="bold" />
              </TouchableOpacity>
            ) : undefined
          }
          className="mb-[10px]"
        />

        {isFetching ? (
          <Loading />
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingTop: 15, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            <View className="w-full gap-[10px]">
              <Typo color="#e5e5e5">Type</Typo>
              <SelectField
                valueLabel={typeLabel}
                placeholder="Select type"
                onPress={() => typeSheetRef.current?.present()}
              />

              {!isTransfer ? (
                <>
                  <Typo color="#e5e5e5" className="mt-2">
                    Category
                  </Typo>
                  <SelectField
                    valueLabel={categoryLabel}
                    placeholder="Select category"
                    onPress={() => categorySheetRef.current?.present()}
                  />
                </>
              ) : null}

              <Typo color="#e5e5e5" className="mt-2">
                {isTransfer ? 'From Account' : 'Account'}
              </Typo>
              <SelectField
                valueLabel={accountLabel}
                placeholder="Select account"
                onPress={() => accountSheetRef.current?.present()}
              />

              {isTransfer ? (
                <>
                  <Typo color="#e5e5e5" className="mt-2">
                    To Account
                  </Typo>
                  <SelectField
                    valueLabel={toAccountLabel}
                    placeholder="Select destination"
                    onPress={() => toAccountSheetRef.current?.present()}
                  />
                </>
              ) : null}

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
                Date
              </Typo>
              <DatePickerField
                value={form.date}
                onChange={(value) => setForm((prev) => ({ ...prev, date: value }))}
              />

              <Typo color="#e5e5e5" className="mt-2">
                Notes
              </Typo>
              <Input
                placeholder="paid wifi bill"
                value={form.notes}
                onChangeText={(value) => setForm((prev) => ({ ...prev, notes: value }))}
              />
            </View>
          </ScrollView>
        )}
      </View>

      {!isFetching ? (
        <View className="mt-6 mb-[5px] flex-row items-center justify-center gap-3 border-t-[1px] border-t-[#404040] px-5 pt-[15px]">
          <Button loading={isLoading} onPress={handleSave} className="flex-1">
            <Typo fontWeight="700" color="#000">
              {isEditing ? 'Update Transaction' : 'Add Transaction'}
            </Typo>
          </Button>
        </View>
      ) : null}

      <BottomSheetSelect
        ref={typeSheetRef}
        title="Transaction Type"
        options={typeOptions}
        value={form.type}
        onChange={(value) =>
          setForm((prev) => ({
            ...prev,
            type: value as TransactionType['type'],
            category: value === 'income' ? incomeCategory.value : 'utilities',
            toAccountId: value === 'transfer' ? prev.toAccountId : '',
          }))
        }
      />

      <BottomSheetSelect
        ref={categorySheetRef}
        title="Category"
        options={categoryOptions}
        value={form.category}
        onChange={(value) => setForm((prev) => ({ ...prev, category: value }))}
      />

      <BottomSheetSelect
        ref={accountSheetRef}
        title={isTransfer ? 'From Account' : 'Account'}
        options={accountOptions}
        value={form.accountId}
        onChange={(value) =>
          setForm((prev) => ({
            ...prev,
            accountId: value,
            toAccountId: prev.toAccountId === value ? '' : prev.toAccountId,
          }))
        }
      />

      <BottomSheetSelect
        ref={toAccountSheetRef}
        title="To Account"
        options={toAccountOptions}
        value={form.toAccountId}
        onChange={(value) => setForm((prev) => ({ ...prev, toAccountId: value }))}
      />
    </ModalWrapper>
  )
}

export default TransactionModal
