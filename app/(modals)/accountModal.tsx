import AppearanceField from '@/components/AppearanceField'
import BackButton from '@/components/BackButton'
import BottomSheetSelect, { type BottomSheetSelectHandle } from '@/components/BottomSheetSelect'
import Button from '@/components/Button'
import Header from '@/components/Header'
import IconColorBottomSheet from '@/components/IconColorBottomSheet'
import Input from '@/components/Input'
import ModalWrapper from '@/components/ModalWrapper'
import SelectField from '@/components/SelectField'
import Typo from '@/components/Typo'
import { ACCOUNT_TYPE_OPTIONS } from '@/constants'
import { useAuth } from '@/context/authContext'
import { createAccount, deleteAccount, getAccountById, getAccountCount, updateAccount } from '@/lib/services/accounts'
import { Account } from '@/lib/types'
import { verticalScale } from '@/utils/styling'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { CheckSquare, Square, Trash } from 'phosphor-react-native'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, TouchableOpacity, View } from 'react-native'
import { showAlert } from '@/context/alertContext'

const EMPTY_ACCOUNT: Account = {
    name: '',
    type: 'bank',
    balance: 0,
    color: '#3B82F6',
    icon: 'Wallet',
    accountNumberLast4: '',
    bankName: '',
    creditLimit: null,
    isPrimary: false,
}

const AccountModal = () => {
    const { user } = useAuth()
    const router = useRouter()
    const params = useLocalSearchParams<{ id?: string | string[] }>()
    const accountId = useMemo(() => {
        const value = params.id
        return Array.isArray(value) ? value[0] : value
    }, [params.id])
    const isEditing = Boolean(accountId)

    const typeSheetRef = useRef<BottomSheetSelectHandle>(null)
    const appearanceSheetRef = useRef<BottomSheetSelectHandle>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [isFetching, setIsFetching] = useState(isEditing)
    const [existingAccountCount, setExistingAccountCount] = useState(0)
    const [accountData, setAccountData] = useState<Account>(EMPTY_ACCOUNT)

    const isFirstAccount = !isEditing && existingAccountCount === 0
    const showPrimaryToggle = isEditing || existingAccountCount > 0
    const primaryLocked = isFirstAccount || (isEditing && existingAccountCount <= 1)

    useEffect(() => {
        let active = true

        const loadAccount = async () => {
            if (!user?.id) {
                setIsFetching(false)
                return
            }

            setIsFetching(true)
            try {
                const count = await getAccountCount(user.id)
                if (!active) return
                setExistingAccountCount(count)

                if (!accountId) {
                    setAccountData({
                        ...EMPTY_ACCOUNT,
                        isPrimary: count === 0,
                    })
                    return
                }

                const data = await getAccountById(user.id, accountId)
                if (!active) return
                setAccountData({
                    ...data,
                    accountNumberLast4: data.accountNumberLast4 ?? '',
                    bankName: data.bankName ?? '',
                    notes: data.notes ?? '',
                    creditLimit: data.creditLimit ?? null,
                })
            } catch (error) {
                console.log('Failed to load account', error)
                if (active) {
                    showAlert('Unable to load account', 'Please try again.')
                    router.back()
                }
            } finally {
                if (active) setIsFetching(false)
            }
        }

        loadAccount()

        return () => {
            active = false
        }
    }, [accountId, user?.id, router])

    const typeLabel = ACCOUNT_TYPE_OPTIONS.find((option) => option.value === accountData.type)?.label ?? ''

    const togglePrimary = () => {
        if (primaryLocked) return
        setAccountData((prev) => ({ ...prev, isPrimary: !prev.isPrimary }))
    }
    const handleSave = async () => {
        if (!user?.id) {
            showAlert('Sign in required', 'Please sign in before saving an account.')
            return
        }

        if (!accountData.name?.trim()) {
            showAlert('Missing account name', 'Please enter an account name.')
            return
        }

        setIsLoading(true)

        try {
            const payload: Account = {
                ...accountData,
                name: accountData.name.trim(),
                balance: Number(accountData.balance ?? 0),
                creditLimit: accountData.creditLimit ?? null,
                notes: accountData.notes ?? null,
            }

            const response = isEditing && accountId
                ? await updateAccount(user.id, accountId, payload)
                : await createAccount(user.id, payload)

            if (!response.success) {
                throw new Error(response.msg || 'Unable to save account')
            }

            showAlert('Success', response.msg || (isEditing ? 'Account updated successfully.' : 'Account created successfully.'))
            router.back()
        } catch (error: any) {
            showAlert('Unable to save account', error?.message ?? 'Please try again.')
        } finally {
            setIsLoading(false)
        }
    }

    const handleDelete = () => {
        if (!user?.id || !accountId) return

        showAlert(
            'Delete account',
            'Are you sure you want to delete this account?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        setIsLoading(true)
                        try {
                            const response = await deleteAccount(user.id, accountId)
                            if (!response.success) {
                                throw new Error(response.msg || 'Unable to delete account')
                            }
                            showAlert('Success', response.msg || 'Account deleted successfully.')
                            router.back()
                        } catch (error: any) {
                            showAlert('Unable to delete account', error?.message ?? 'Please try again.')
                        } finally {
                            setIsLoading(false)
                        }
                    },
                },
            ]
        )
    }

    return (
        <ModalWrapper>
            <View className='flex-1 px-5'>
                <Header
                    title={isEditing ? 'Update Account' : 'New Account'}
                    leftIcon={<BackButton />}
                    rightIcon={
                        isEditing ? (
                            <TouchableOpacity onPress={handleDelete} hitSlop={12} disabled={isLoading || isFetching}>
                                <Trash size={verticalScale(22)} color="#ef4444" weight="bold" />
                            </TouchableOpacity>
                        ) : undefined
                    }
                    className='mb-[10px]'
                />

                {isFetching ? (
                    <View className='flex-1 justify-center items-center'>
                        <Typo color='#a3a3a3'>Loading account...</Typo>
                    </View>
                ) : (
                    <ScrollView
                        className='flex-1'
                        contentContainerStyle={{ paddingTop: 15, paddingBottom: 24 }}
                        showsVerticalScrollIndicator={false}
                    >
                        <View className='w-full items-center'>
                            <View className='mt-6 w-full gap-[10px]'>
                                <Typo color="#e5e5e5">Account Name</Typo>
                                <Input
                                    placeholder='Salary'
                                    value={accountData.name}
                                    onChangeText={(value) => setAccountData({ ...accountData, name: value })}
                                />

                                <Typo color="#e5e5e5" className='mt-2'>Account Type</Typo>
                                <SelectField
                                    valueLabel={typeLabel}
                                    placeholder='Select account type'
                                    onPress={() => typeSheetRef.current?.present()}
                                />

                                <Typo color="#e5e5e5" className='mt-2'>Appearance</Typo>
                                <AppearanceField
                                    icon={accountData.icon ?? 'Wallet'}
                                    color={accountData.color ?? '#3B82F6'}
                                    onPress={() => appearanceSheetRef.current?.present()}
                                />

                                {!isEditing ? (
                                    <>
                                        <Typo color="#e5e5e5" className='mt-2'>Balance</Typo>
                                        <Input
                                            placeholder='0'
                                            keyboardType='numeric'
                                            value={accountData.balance?.toString() ?? '0'}
                                            onChangeText={(value) => setAccountData({ ...accountData, balance: Number(value || 0) })}
                                        />
                                    </>
                                ) : null}

                                <Typo color="#e5e5e5" className='mt-2'>Bank Name (Optional)</Typo>
                                <Input
                                    placeholder='Example Bank'
                                    value={accountData.bankName ?? ''}
                                    onChangeText={(value) => setAccountData({ ...accountData, bankName: value })}
                                />

                                <Typo color="#e5e5e5" className='mt-2'>Last 4 Digits (Optional)</Typo>
                                <Input
                                    placeholder='1234'
                                    keyboardType='numeric'
                                    maxLength={4}
                                    value={accountData.accountNumberLast4 ?? ''}
                                    onChangeText={(value) =>
                                        setAccountData({
                                            ...accountData,
                                            accountNumberLast4: value.replace(/[^0-9]/g, '').slice(0, 4),
                                        })
                                    }
                                />

                                <Typo color="#e5e5e5" className='mt-2'>Credit Limit (Optional)</Typo>
                                <Input
                                    placeholder='0'
                                    keyboardType='numeric'
                                    value={accountData.creditLimit?.toString() ?? ''}
                                    onChangeText={(value) => setAccountData({ ...accountData, creditLimit: Number(value || 0) })}
                                />

                                <Typo color="#e5e5e5" className='mt-2'>Notes (Optional)</Typo>
                                <Input
                                    placeholder='Optional notes'
                                    value={accountData.notes ?? ''}
                                    onChangeText={(value) => setAccountData({ ...accountData, notes: value })}
                                />

                                {(showPrimaryToggle || isFirstAccount) ? (
                                    <TouchableOpacity
                                        onPress={togglePrimary}
                                        activeOpacity={primaryLocked ? 1 : 0.8}
                                        disabled={primaryLocked}
                                        className='mt-3 flex-row items-center gap-3 rounded-[17px] border border-[#404040] bg-[#262626] px-4 py-4'
                                    >
                                        {accountData.isPrimary || isFirstAccount ? (
                                            <CheckSquare size={24} color="#a3e635" weight="fill" />
                                        ) : (
                                            <Square size={24} color="#a3a3a3" weight="regular" />
                                        )}
                                        <View className='flex-1'>
                                            <Typo color="#f5f5f5" fontWeight="600">
                                                Primary account
                                            </Typo>
                                            <Typo size={12} color="#a3a3a3">
                                                {isFirstAccount || primaryLocked
                                                    ? 'Your only / first account is always primary'
                                                    : 'Only one account can be primary at a time'}
                                            </Typo>
                                        </View>
                                    </TouchableOpacity>
                                ) : null}
                            </View>
                        </View>
                    </ScrollView>
                )}
            </View>
            <View className='mt-6 items-center flex-row justify-center px-5 gap-3 pt-[15px] border-t-[#404040] mb-[5px]  border-t-[1px]'>
                <Button loading={isLoading || isFetching} onPress={handleSave} className='flex-1'>
                    <Typo fontWeight={'700'} color='#000'>
                        {isEditing ? 'Update Account' : 'Add Account'}
                    </Typo>
                </Button>
            </View>

            <BottomSheetSelect
                ref={typeSheetRef}
                title="Account Type"
                options={ACCOUNT_TYPE_OPTIONS}
                value={accountData.type}
                onChange={(value) =>
                    setAccountData((prev) => ({ ...prev, type: value as Account['type'] }))
                }
            />

            <IconColorBottomSheet
                ref={appearanceSheetRef}
                icon={accountData.icon ?? 'Wallet'}
                color={accountData.color ?? '#3B82F6'}
                onChange={({ icon, color }) =>
                    setAccountData((prev) => ({ ...prev, icon, color }))
                }
            />
        </ModalWrapper>
    )
}

export default AccountModal
