import { expenseCategories, getCategoryByValue, incomeCategory } from '@/constants/data'
import { ResponseType, TransactionType } from '@/types'
import { supabase } from '../supabase'

type TransactionRow = {
  id: string
  user_id: string
  account_id: string
  to_account_id: string | null
  type: 'expense' | 'income' | 'transfer'
  category: string | null
  amount: number
  description: string | null
  status: 'completed' | 'pending' | 'cancelled'
  transaction_date: string
  image_url: string | null
  created_at: string
  updated_at: string
}

export function mapTransactionRow(row: TransactionRow): TransactionType {
  return {
    id: row.id,
    userId: row.user_id,
    uid: row.user_id,
    accountId: row.account_id,
    toAccountId: row.to_account_id,
    type: row.type,
    category: row.category,
    amount: Number(row.amount),
    description: row.description,
    notes: row.description,
    status: row.status,
    date: row.transaction_date,
    imageUrl: row.image_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getRecentTransactions(userId: string, limit = 20) {
  if (!userId) throw new Error('User not authenticated')

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data as TransactionRow[]).map(mapTransactionRow)
}

export type TransactionPageParams = {
  limit?: number
  offset?: number
  type?: 'expense' | 'income' | 'transfer'
  accountId?: string
  from?: string
  to?: string
  search?: string
}

export async function getTransactionsPage(
  userId: string,
  params: TransactionPageParams = {}
) {
  if (!userId) throw new Error('User not authenticated')

  const limit = params.limit ?? 20
  const offset = params.offset ?? 0

  let query = supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (params.type) query = query.eq('type', params.type)
  if (params.accountId) {
    query = query.or(
      `account_id.eq.${params.accountId},to_account_id.eq.${params.accountId}`
    )
  }
  if (params.from) query = query.gte('transaction_date', params.from)
  if (params.to) query = query.lte('transaction_date', params.to)
  if (params.search?.trim()) {
    const q = params.search.trim().replace(/[%_,.()]/g, '')
    if (q) {
      // `type` is a Postgres enum — ilike is invalid; match via eq when query is a known type
      const needle = q.toLowerCase()
      const typeMatch = ['expense', 'income', 'transfer'].find(
        (value) => value === needle || (needle.length >= 3 && value.startsWith(needle))
      )
      const filters = [
        `description.ilike.%${q}%`,
        `category.ilike.%${q}%`,
        ...(typeMatch ? [`type.eq.${typeMatch}`] : []),
      ]
      query = query.or(filters.join(','))
    }
  }

  const { data, error } = await query
  if (error) throw error

  const items = (data as TransactionRow[]).map(mapTransactionRow)
  return { items, hasMore: items.length === limit }
}

export async function getTransactionTotals(userId: string) {
  if (!userId) throw new Error('User not authenticated')

  const { data, error } = await supabase
    .from('transactions')
    .select('type, amount, status')
    .eq('user_id', userId)
    .eq('status', 'completed')

  if (error) throw error

  return (data ?? []).reduce(
    (acc, row) => {
      const amount = Number(row.amount ?? 0)
      if (row.type === 'income') acc.income += amount
      if (row.type === 'expense') acc.expense += amount
      return acc
    },
    { income: 0, expense: 0 }
  )
}

export type AccountTotalsMap = Record<string, { income: number; expense: number }>

export async function getTransactionTotalsByAccount(userId: string): Promise<AccountTotalsMap> {
  if (!userId) throw new Error('User not authenticated')

  const { data, error } = await supabase
    .from('transactions')
    .select('type, amount, status, account_id')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .in('type', ['income', 'expense'])

  if (error) throw error

  return (data ?? []).reduce<AccountTotalsMap>((acc, row) => {
    const accountId = row.account_id as string
    if (!accountId) return acc
    if (!acc[accountId]) acc[accountId] = { income: 0, expense: 0 }
    const amount = Number(row.amount ?? 0)
    if (row.type === 'income') acc[accountId].income += amount
    if (row.type === 'expense') acc[accountId].expense += amount
    return acc
  }, {})
}

export async function createTransaction(
  userId: string,
  transaction: Omit<TransactionType, 'id' | 'userId' | 'uid'>
): Promise<ResponseType> {
  if (!userId) return { success: false, msg: 'User not authenticated' }

  const validated = validateTransactionInput(transaction)
  if (!validated.ok) return { success: false, msg: validated.msg }

  const payload = {
    user_id: userId,
    ...buildTransactionPayload(transaction),
  }

  try {
    const { data, error } = await supabase.from('transactions').insert(payload).select().single()
    if (error) return { success: false, msg: error.message }

    void import('@/lib/services/lowBalanceAlerts').then(({ queueLowBalanceCheck }) =>
      queueLowBalanceCheck(userId)
    )

    return {
      success: true,
      data: mapTransactionRow(data as TransactionRow),
      msg: 'Transaction added successfully',
    }
  } catch (error: any) {
    return { success: false, msg: error?.message || 'Unable to create transaction' }
  }
}

function validateTransactionInput(transaction: Omit<TransactionType, 'id' | 'userId' | 'uid'>) {
  if (!transaction.accountId) {
    return { ok: false as const, msg: 'Please select an account' }
  }

  if (!transaction.type || !['expense', 'income', 'transfer'].includes(transaction.type)) {
    return { ok: false as const, msg: 'Invalid transaction type' }
  }

  if (!(typeof transaction.amount === 'number') || !Number.isFinite(transaction.amount) || transaction.amount <= 0) {
    return { ok: false as const, msg: 'Amount must be greater than 0' }
  }

  if (transaction.type === 'transfer') {
    if (!transaction.toAccountId) {
      return { ok: false as const, msg: 'Please select a destination account' }
    }
    if (transaction.toAccountId === transaction.accountId) {
      return { ok: false as const, msg: 'Choose two different accounts for transfer' }
    }
  } else {
    const category = transaction.category?.trim()
    if (!category) return { ok: false as const, msg: 'Please select a category' }
    const known =
      category === incomeCategory.value || Boolean(expenseCategories[category]) || Boolean(getCategoryByValue(category))
    if (!known) return { ok: false as const, msg: 'Invalid category' }
  }

  return { ok: true as const }
}

function buildTransactionPayload(transaction: Omit<TransactionType, 'id' | 'userId' | 'uid'>) {
  const notes = (transaction.notes ?? transaction.description)?.trim() || null

  const dateValue =
    transaction.date instanceof Date
      ? transaction.date.toISOString()
      : transaction.date
        ? new Date(transaction.date).toISOString()
        : new Date().toISOString()

  return {
    account_id: transaction.accountId,
    to_account_id: transaction.type === 'transfer' ? transaction.toAccountId : null,
    type: transaction.type,
    category: transaction.type === 'transfer' ? null : transaction.category?.trim() || null,
    amount: Number(transaction.amount),
    description: notes,
    status: transaction.status ?? 'completed',
    transaction_date: dateValue,
    image_url: transaction.imageUrl ?? null,
  }
}

export async function getTransactionById(userId: string, transactionId: string) {
  if (!userId) throw new Error('User not authenticated')
  if (!transactionId) throw new Error('Transaction not found')

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', transactionId)
    .eq('user_id', userId)
    .single()

  if (error) throw error
  return mapTransactionRow(data as TransactionRow)
}

export async function updateTransaction(
  userId: string,
  transactionId: string,
  transaction: Omit<TransactionType, 'id' | 'userId' | 'uid'>
): Promise<ResponseType> {
  if (!userId) return { success: false, msg: 'User not authenticated' }
  if (!transactionId) return { success: false, msg: 'Transaction not found' }

  const validated = validateTransactionInput(transaction)
  if (!validated.ok) return { success: false, msg: validated.msg }

  try {
    const { data, error } = await supabase
      .from('transactions')
      .update(buildTransactionPayload(transaction))
      .eq('id', transactionId)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) return { success: false, msg: error.message }

    void import('@/lib/services/lowBalanceAlerts').then(({ queueLowBalanceCheck }) =>
      queueLowBalanceCheck(userId)
    )

    return {
      success: true,
      data: mapTransactionRow(data as TransactionRow),
      msg: 'Transaction updated successfully',
    }
  } catch (error: any) {
    return { success: false, msg: error?.message || 'Unable to update transaction' }
  }
}

export async function deleteTransaction(userId: string, transactionId: string): Promise<ResponseType> {
  if (!userId) return { success: false, msg: 'User not authenticated' }
  if (!transactionId) return { success: false, msg: 'Transaction not found' }

  try {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', transactionId)
      .eq('user_id', userId)

    if (error) return { success: false, msg: error.message }

    void import('@/lib/services/lowBalanceAlerts').then(({ queueLowBalanceCheck }) =>
      queueLowBalanceCheck(userId)
    )

    return { success: true, msg: 'Transaction deleted successfully' }
  } catch (error: any) {
    return { success: false, msg: error?.message || 'Unable to delete transaction' }
  }
}
