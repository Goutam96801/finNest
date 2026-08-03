import { mapAccountRow } from '@/lib/services/accounts'
import { mapNotification, type AppNotification } from '@/lib/services/notifications'
import { mapSubscription, type Subscription } from '@/lib/services/subscriptions'
import { mapTransactionRow } from '@/lib/services/transactions'
import { Account } from '@/lib/types'
import { TransactionType } from '@/types'
import { supabase } from '../supabase'

export type GlobalSearchResults = {
  accounts: Account[]
  transactions: TransactionType[]
  subscriptions: Subscription[]
  notifications: AppNotification[]
}

const PER_TYPE = 8

const ACCOUNT_TYPES = ['bank', 'cash', 'wallet', 'credit_card', 'investment', 'loan', 'other'] as const
const TRANSACTION_TYPES = ['expense', 'income', 'transfer'] as const

const sanitizeQuery = (value: string) => value.trim().replace(/[%_,.()]/g, '')

const textOr = (columns: string[], q: string) =>
  columns.map((column) => `${column}.ilike.%${q}%`).join(',')

const withEnumMatch = (
  base: string,
  enumColumn: string,
  candidates: readonly string[],
  q: string
) => {
  const needle = q.toLowerCase()
  const match = candidates.find(
    (value) => value === needle || (needle.length >= 3 && value.startsWith(needle))
  )
  return match ? `${base},${enumColumn}.eq.${match}` : base
}

export async function globalSearch(userId: string, rawQuery: string): Promise<GlobalSearchResults> {
  if (!userId) throw new Error('User not authenticated')

  const q = sanitizeQuery(rawQuery)
  if (!q) {
    return { accounts: [], transactions: [], subscriptions: [], notifications: [] }
  }

  const accountOr = withEnumMatch(textOr(['name', 'bank_name'], q), 'type', ACCOUNT_TYPES, q)
  const transactionOr = withEnumMatch(
    textOr(['description', 'category'], q),
    'type',
    TRANSACTION_TYPES,
    q
  )
  const subscriptionOr = textOr(['name', 'notes', 'category'], q)
  const notificationOr = textOr(['title', 'body'], q)

  const [accountsRes, transactionsRes, subscriptionsRes, notificationsRes] = await Promise.all([
    supabase
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_archived', false)
      .or(accountOr)
      .order('display_order', { ascending: true })
      .limit(PER_TYPE),
    supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .or(transactionOr)
      .order('transaction_date', { ascending: false })
      .limit(PER_TYPE),
    supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .or(subscriptionOr)
      .order('next_due_date', { ascending: true })
      .limit(PER_TYPE),
    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .or(notificationOr)
      .order('created_at', { ascending: false })
      .limit(PER_TYPE),
  ])

  if (accountsRes.error) throw accountsRes.error
  if (transactionsRes.error) throw transactionsRes.error
  if (subscriptionsRes.error) throw subscriptionsRes.error
  if (notificationsRes.error) throw notificationsRes.error

  return {
    accounts: (accountsRes.data ?? []).map((row) => mapAccountRow(row as any)),
    transactions: (transactionsRes.data ?? []).map((row) => mapTransactionRow(row as any)),
    subscriptions: (subscriptionsRes.data ?? []).map((row) => mapSubscription(row as any)),
    notifications: (notificationsRes.data ?? []).map((row) => mapNotification(row as any)),
  }
}
