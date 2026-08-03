import { ResponseType } from '@/types'
import { supabase } from '../supabase'
import { Account, AccountType } from '../types'

type AccountRow = {
    id: string
    user_id: string
    name: string
    type: AccountType
    balance: number
    color: string
    icon: string
    account_number_last4: string | null
    bank_name: string | null
    credit_limit: number | null
    is_primary: boolean
    is_archived: boolean
    display_order: number
    notes: string | null
    created_at: string
    updated_at: string
}

const ALLOWED_ACCOUNT_TYPES = ['bank', 'cash', 'wallet', 'credit_card', 'investment', 'loan', 'other'] as const

export function mapAccountRow(row: AccountRow): Account {
    return {
        id: row.id,
        userId: row.user_id,
        name: row.name,
        type: row.type,
        balance: Number(row.balance ?? 0),
        color: row.color,
        icon: row.icon,
        accountNumberLast4: row.account_number_last4,
        bankName: row.bank_name,
        creditLimit: row.credit_limit == null ? null : Number(row.credit_limit),
        isPrimary: row.is_primary,
        isArchived: row.is_archived,
        displayOrder: row.display_order,
        notes: row.notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

function normalizeAccountType(value?: string): AccountType {
    const normalizedValue = value?.trim().toLowerCase()
    return ALLOWED_ACCOUNT_TYPES.includes(normalizedValue as (typeof ALLOWED_ACCOUNT_TYPES)[number])
        ? (normalizedValue as AccountType)
        : 'bank'
}

function buildAccountPayload(userId: string, accountData: Account, options?: { includeUserId?: boolean }) {
    const rawLast4 = accountData.accountNumberLast4?.trim() ?? ''
    if (rawLast4 && !/^[0-9]{4}$/.test(rawLast4)) {
        return { error: 'Last 4 digits must be exactly 4 numbers' as const }
    }

    const payload = {
        ...(options?.includeUserId === false ? {} : { user_id: userId }),
        name: accountData.name?.trim() || 'New Account',
        type: normalizeAccountType(accountData.type),
        balance:
            typeof accountData.balance === 'number' && Number.isFinite(accountData.balance)
                ? Number(accountData.balance)
                : 0,
        color: accountData.color?.trim() || '#3B82F6',
        icon: accountData.icon?.trim() || 'Wallet',
        account_number_last4: rawLast4 || null,
        bank_name: accountData.bankName?.trim() || null,
        credit_limit:
            typeof accountData.creditLimit === 'number' &&
            Number.isFinite(accountData.creditLimit) &&
            accountData.creditLimit >= 0
                ? Number(accountData.creditLimit)
                : null,
        is_primary: Boolean(accountData.isPrimary),
        notes: accountData.notes?.trim() || null,
    }

    return { payload }
}

export async function getAccounts(userId: string) {
    if (!userId) {
        throw new Error('User not authenticated')
    }

    const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', userId)
        .eq('is_archived', false)
        .order('is_primary', { ascending: false })
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true })

    if (error) {
        throw error
    }

    return (data as AccountRow[]).map(mapAccountRow)
}

export async function getAccountCount(userId: string) {
    if (!userId) {
        throw new Error('User not authenticated')
    }

    const { count, error } = await supabase
        .from('accounts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_archived', false)

    if (error) {
        throw error
    }

    return count ?? 0
}

async function clearOtherPrimaryAccounts(userId: string, exceptAccountId?: string) {
    let query = supabase
        .from('accounts')
        .update({ is_primary: false })
        .eq('user_id', userId)
        .eq('is_archived', false)
        .eq('is_primary', true)

    if (exceptAccountId) {
        query = query.neq('id', exceptAccountId)
    }

    const { error } = await query
    if (error) {
        throw error
    }
}

export async function getAccountById(userId: string, accountId: string) {
    if (!userId) {
        throw new Error('User not authenticated')
    }

    const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', accountId)
        .eq('user_id', userId)
        .single()

    if (error) {
        throw error
    }

    return mapAccountRow(data as AccountRow)
}

export async function createAccount(userId: string, accountData: Account): Promise<ResponseType> {
    if (!userId) {
        return { success: false, msg: 'User not authenticated' }
    }

    const built = buildAccountPayload(userId, accountData)
    if ('error' in built) {
        return { success: false, msg: built.error }
    }

    try {
        const existingCount = await getAccountCount(userId)
        const shouldBePrimary = existingCount === 0 || Boolean(accountData.isPrimary)

        if (shouldBePrimary && existingCount > 0) {
            await clearOtherPrimaryAccounts(userId)
        }

        const { data, error } = await supabase
            .from('accounts')
            .insert({
                ...built.payload,
                is_primary: shouldBePrimary,
                is_archived: false,
                display_order: 0,
            })
            .select()
            .single()

        if (error) {
            return { success: false, msg: error.message }
        }

        return {
            success: true,
            data: mapAccountRow(data as AccountRow),
            msg: 'Account created successfully',
        }
    } catch (error: any) {
        return { success: false, msg: error?.message || 'Unable to create account' }
    }
}

export async function updateAccount(
    userId: string,
    accountId: string,
    accountData: Account
): Promise<ResponseType> {
    if (!userId) {
        return { success: false, msg: 'User not authenticated' }
    }

    if (!accountId) {
        return { success: false, msg: 'Account not found' }
    }

    const built = buildAccountPayload(userId, accountData, { includeUserId: false })
    if ('error' in built) {
        return { success: false, msg: built.error }
    }

    try {
        const existingCount = await getAccountCount(userId)
        const wantsPrimary = Boolean(accountData.isPrimary)
        const mustStayPrimary = existingCount <= 1
        const nextIsPrimary = mustStayPrimary ? true : wantsPrimary

        if (nextIsPrimary) {
            await clearOtherPrimaryAccounts(userId, accountId)
        }

        // Balance is managed by transactions — never overwrite on edit
        const { balance: _ignoredBalance, ...updateFields } = built.payload

        const { data, error } = await supabase
            .from('accounts')
            .update({
                ...updateFields,
                is_primary: nextIsPrimary,
            })
            .eq('id', accountId)
            .eq('user_id', userId)
            .select()
            .single()

        if (error) {
            return { success: false, msg: error.message }
        }

        return {
            success: true,
            data: mapAccountRow(data as AccountRow),
            msg: 'Account updated successfully',
        }
    } catch (error: any) {
        return { success: false, msg: error?.message || 'Unable to update account' }
    }
}

export async function deleteAccount(userId: string, accountId: string): Promise<ResponseType> {
    if (!userId) {
        return { success: false, msg: 'User not authenticated' }
    }

    if (!accountId) {
        return { success: false, msg: 'Account not found' }
    }

    try {
        const existing = await getAccountById(userId, accountId)

        const { error } = await supabase
            .from('accounts')
            .update({ is_archived: true, is_primary: false })
            .eq('id', accountId)
            .eq('user_id', userId)

        if (error) {
            return { success: false, msg: error.message }
        }

        if (existing.isPrimary) {
            const remaining = await getAccounts(userId)
            if (remaining[0]?.id) {
                await supabase
                    .from('accounts')
                    .update({ is_primary: true })
                    .eq('id', remaining[0].id)
                    .eq('user_id', userId)
            }
        }

        return { success: true, msg: 'Account deleted successfully' }
    } catch (error: any) {
        return { success: false, msg: error?.message || 'Unable to delete account' }
    }
}
