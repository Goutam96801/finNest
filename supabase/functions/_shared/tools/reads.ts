import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

type ToolContext = {
  args: Record<string, unknown>
  userId: string
  userClient: SupabaseClient
}

type Row = Record<string, unknown>

const MAX_LIST_ROWS = 25
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function getLimit(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return 20
  return Math.min(MAX_LIST_ROWS, Math.max(1, Math.floor(parsed)))
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function compactAccount(row: Row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    balance: Number(row.balance ?? 0),
    bank_name: row.bank_name,
    is_primary: row.is_primary,
  }
}

function compactTransaction(row: Row) {
  return {
    id: row.id,
    account_id: row.account_id,
    to_account_id: row.to_account_id,
    type: row.type,
    category: row.category,
    amount: Number(row.amount ?? 0),
    description: row.description,
    status: row.status,
    transaction_date: row.transaction_date,
  }
}

export async function listAccounts({ args, userId, userClient }: ToolContext) {
  const { data, error } = await userClient
    .from('accounts')
    .select('id, name, type, balance, bank_name, is_primary')
    .eq('user_id', userId)
    .eq('is_archived', false)
    .order('is_primary', { ascending: false })
    .order('display_order', { ascending: true })
    .limit(getLimit(args.limit))

  if (error) throw error
  return (data as Row[] | null ?? []).map(compactAccount)
}

export async function listTransactions({ args, userId, userClient }: ToolContext) {
  let query = userClient
    .from('transactions')
    .select(
      'id, account_id, to_account_id, type, category, amount, description, status, transaction_date'
    )
    .eq('user_id', userId)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(getLimit(args.limit))

  const type = getString(args.type)
  if (type && ['expense', 'income', 'transfer'].includes(type)) query = query.eq('type', type)

  const accountId = getString(args.accountId)
  if (accountId && UUID_PATTERN.test(accountId)) {
    query = query.or(`account_id.eq.${accountId},to_account_id.eq.${accountId}`)
  }

  const from = getString(args.from)
  if (from) query = query.gte('transaction_date', from)

  const to = getString(args.to)
  if (to) query = query.lte('transaction_date', to)

  const search = getString(args.search)?.replace(/[^a-zA-Z0-9\s-]/g, '').slice(0, 100)
  if (search) query = query.or(`description.ilike.%${search}%,category.ilike.%${search}%`)

  const { data, error } = await query
  if (error) throw error
  return (data as Row[] | null ?? []).map(compactTransaction)
}

export async function getTransaction({ args, userId, userClient }: ToolContext) {
  const transactionId = getString(args.transactionId)
  if (!transactionId) throw new Error('transactionId is required')

  const { data, error } = await userClient
    .from('transactions')
    .select(
      'id, account_id, to_account_id, type, category, amount, description, status, transaction_date'
    )
    .eq('id', transactionId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data ? compactTransaction(data as Row) : null
}

export async function listSubscriptions({ args, userId, userClient }: ToolContext) {
  const { data, error } = await userClient
    .from('subscriptions')
    .select('id, account_id, name, amount, category, frequency, next_due_date, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('next_due_date', { ascending: true })
    .limit(getLimit(args.limit))

  if (error) throw error
  return (data as Row[] | null ?? []).map((row) => ({
    id: row.id,
    account_id: row.account_id,
    name: row.name,
    amount: Number(row.amount ?? 0),
    category: row.category,
    frequency: row.frequency,
    next_due_date: row.next_due_date,
    is_active: row.is_active,
  }))
}

export async function getProfile({ userId, userClient }: ToolContext) {
  const { data, error } = await userClient
    .from('profiles')
    .select('full_name, avatar_url, currency, timezone')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const row = data as Row
  return {
    full_name: row.full_name,
    avatar_url: row.avatar_url,
    currency: row.currency,
    timezone: row.timezone,
  }
}

export async function listNotifications({ args, userId, userClient }: ToolContext) {
  const { data, error } = await userClient
    .from('notifications')
    .select('id, type, title, body, is_read, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(getLimit(args.limit))

  if (error) throw error
  return (data as Row[] | null ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    is_read: row.is_read,
    created_at: row.created_at,
  }))
}
