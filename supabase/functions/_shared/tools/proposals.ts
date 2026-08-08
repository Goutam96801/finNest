import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

type ToolContext = {
  args: Record<string, unknown>
  userId: string
  userClient: SupabaseClient
}

export type TransactionPayload = {
  account_id: string
  to_account_id: string | null
  type: 'expense' | 'income' | 'transfer'
  category: string | null
  amount: number
  description: string | null
  status: 'completed' | 'pending' | 'cancelled'
  transaction_date: string
}

type TransactionRow = TransactionPayload & { id: string }

const transactionTypes = ['expense', 'income', 'transfer'] as const
const transactionStatuses = ['completed', 'pending', 'cancelled'] as const

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function requiredString(value: unknown, label: string): string {
  const parsed = optionalString(value)
  if (!parsed) throw new Error(`${label} is required`)
  return parsed
}

function optionalDate(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' && !(value instanceof Date)) throw new Error('Invalid transaction date')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('Invalid transaction date')
  return date.toISOString()
}

function requiredAmount(value: unknown): number {
  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than 0')
  return amount
}

async function assertAccountOwned(userClient: SupabaseClient, userId: string, accountId: string) {
  const { data, error } = await userClient
    .from('accounts')
    .select('id')
    .eq('id', accountId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Account not found')
}

export async function buildTransactionPayload(
  userClient: SupabaseClient,
  userId: string,
  args: Record<string, unknown>,
  existing?: TransactionPayload
): Promise<TransactionPayload> {
  const accountId = optionalString(args.accountId) ?? existing?.account_id
  if (!accountId) throw new Error('Account is required')

  const type = optionalString(args.type) ?? existing?.type
  if (!type || !transactionTypes.includes(type as typeof transactionTypes[number])) {
    throw new Error('Invalid transaction type')
  }

  const amount = args.amount === undefined ? existing?.amount : requiredAmount(args.amount)
  if (amount === undefined) throw new Error('Amount is required')

  const toAccountId = optionalString(args.toAccountId) ?? existing?.to_account_id ?? null
  const category = optionalString(args.category) ?? existing?.category ?? null
  const status = optionalString(args.status) ?? existing?.status ?? 'completed'
  const transactionDate = optionalDate(args.transactionDate ?? args.date)
    ?? existing?.transaction_date
    ?? new Date().toISOString()
  const description = args.description === undefined && args.notes === undefined
    ? existing?.description ?? null
    : optionalString(args.description ?? args.notes) ?? null

  if (!transactionStatuses.includes(status as typeof transactionStatuses[number])) {
    throw new Error('Invalid transaction status')
  }
  if (type === 'transfer') {
    if (!toAccountId) throw new Error('Destination account is required for transfers')
    if (toAccountId === accountId) throw new Error('Choose two different accounts for transfer')
  } else if (!category) {
    throw new Error('Category is required for income and expense transactions')
  }

  await assertAccountOwned(userClient, userId, accountId)
  if (type === 'transfer' && toAccountId) {
    await assertAccountOwned(userClient, userId, toAccountId)
  }

  return {
    account_id: accountId,
    to_account_id: type === 'transfer' ? toAccountId : null,
    type: type as TransactionPayload['type'],
    category: type === 'transfer' ? null : category,
    amount,
    description,
    status: status as TransactionPayload['status'],
    transaction_date: transactionDate,
  }
}

async function getOwnedTransaction({ args, userId, userClient }: ToolContext): Promise<TransactionRow> {
  const transactionId = requiredString(args.transactionId, 'transactionId')
  const { data, error } = await userClient
    .from('transactions')
    .select('id, account_id, to_account_id, type, category, amount, description, status, transaction_date')
    .eq('id', transactionId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Transaction not found')
  return data as TransactionRow
}

function summaryFor(toolName: string, transaction?: TransactionPayload): string {
  if (toolName === 'propose_delete_transaction') return 'Delete this transaction.'
  const verb = toolName === 'propose_create_transaction' ? 'Add' : 'Update'
  const type = transaction?.type ?? 'transaction'
  return `${verb} a ${type} transaction for ${transaction?.amount ?? 0}.`
}

async function insertProposal(
  userClient: SupabaseClient,
  userId: string,
  toolName: string,
  payload: Record<string, unknown>,
  summary: string,
  preview: unknown
) {
  const { data, error } = await userClient
    .from('fynn_proposals')
    .insert({
      user_id: userId,
      tool_name: toolName,
      payload,
      summary,
      status: 'pending',
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single()

  if (error) throw error
  return { proposal_id: data.id, summary, preview }
}

export async function proposeCreateTransaction(context: ToolContext) {
  const transaction = await buildTransactionPayload(context.userClient, context.userId, context.args)
  return insertProposal(
    context.userClient,
    context.userId,
    'propose_create_transaction',
    { transaction },
    summaryFor('propose_create_transaction', transaction),
    transaction
  )
}

export async function proposeUpdateTransaction(context: ToolContext) {
  const existing = await getOwnedTransaction(context)
  const transaction = await buildTransactionPayload(context.userClient, context.userId, context.args, existing)
  return insertProposal(
    context.userClient,
    context.userId,
    'propose_update_transaction',
    { transaction_id: existing.id, transaction },
    summaryFor('propose_update_transaction', transaction),
    { id: existing.id, ...transaction }
  )
}

export async function proposeDeleteTransaction(context: ToolContext) {
  const transaction = await getOwnedTransaction(context)
  return insertProposal(
    context.userClient,
    context.userId,
    'propose_delete_transaction',
    { transaction_id: transaction.id },
    summaryFor('propose_delete_transaction'),
    transaction
  )
}

const accountTypes = ['bank', 'cash', 'wallet', 'credit_card', 'investment', 'loan', 'other'] as const
const subscriptionFrequencies = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : undefined
}

function optionalArg(args: Record<string, unknown>, camel: string, snake: string): unknown {
  return args[camel] ?? args[snake]
}

async function getOwnedRow(
  userClient: SupabaseClient,
  userId: string,
  table: 'accounts' | 'subscriptions' | 'notifications',
  id: string,
  columns = '*'
): Promise<Record<string, unknown>> {
  const { data, error } = await userClient
    .from(table)
    .select(columns)
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error(`${table.slice(0, -1)} not found`)
  return data as unknown as Record<string, unknown>
}

export type AccountPayload = {
  name: string
  type: typeof accountTypes[number]
  balance: number
  color: string
  icon: string
  account_number_last4: string | null
  bank_name: string | null
  credit_limit: number | null
  is_primary: boolean
  notes: string | null
}

export function buildAccountPayload(args: Record<string, unknown>, existing?: AccountPayload): AccountPayload {
  const name = optionalString(args.name) ?? existing?.name ?? 'New Account'
  const type = optionalString(args.type) ?? existing?.type ?? 'bank'
  const balance = optionalNumber(args.balance) ?? existing?.balance ?? 0
  const color = optionalString(args.color) ?? existing?.color ?? '#3B82F6'
  const icon = optionalString(args.icon) ?? existing?.icon ?? 'Wallet'
  const last4 = optionalString(optionalArg(args, 'accountNumberLast4', 'account_number_last4'))
    ?? existing?.account_number_last4 ?? null
  const bankName = optionalString(optionalArg(args, 'bankName', 'bank_name'))
    ?? existing?.bank_name ?? null
  const creditLimitInput = optionalArg(args, 'creditLimit', 'credit_limit')
  const creditLimit = creditLimitInput === undefined
    ? existing?.credit_limit ?? null
    : optionalNumber(creditLimitInput) ?? null
  const isPrimary = optionalBoolean(optionalArg(args, 'isPrimary', 'is_primary'))
    ?? existing?.is_primary ?? false
  const notes = args.notes === undefined ? existing?.notes ?? null : optionalString(args.notes) ?? null

  if (!accountTypes.includes(type as typeof accountTypes[number])) throw new Error('Invalid account type')
  if (!Number.isFinite(balance) || balance <= -999999999) throw new Error('Invalid account balance')
  if (last4 && !/^[0-9]{4}$/.test(last4)) throw new Error('Last 4 digits must be exactly 4 numbers')
  if (creditLimit !== null && creditLimit < 0) throw new Error('Credit limit must not be negative')

  return {
    name,
    type: type as AccountPayload['type'],
    balance,
    color,
    icon,
    account_number_last4: last4,
    bank_name: bankName,
    credit_limit: creditLimit,
    is_primary: isPrimary,
    notes,
  }
}

export async function proposeCreateAccount(context: ToolContext) {
  const account = buildAccountPayload(context.args)
  return insertProposal(context.userClient, context.userId, 'propose_create_account', { account },
    `Create the ${account.name} account.`, account)
}

export async function proposeUpdateAccount(context: ToolContext) {
  const accountId = requiredString(context.args.accountId, 'accountId')
  const existing = await getOwnedRow(context.userClient, context.userId, 'accounts', accountId)
  const account = buildAccountPayload(context.args, existing as unknown as AccountPayload)
  account.balance = Number(existing.balance)
  return insertProposal(context.userClient, context.userId, 'propose_update_account',
    { account_id: accountId, account }, `Update the ${account.name} account.`, { id: accountId, ...account })
}

export async function proposeDeleteAccount(context: ToolContext) {
  const accountId = requiredString(context.args.accountId, 'accountId')
  const account = await getOwnedRow(context.userClient, context.userId, 'accounts', accountId)
  if (account.is_archived) throw new Error('Account is already archived')
  return insertProposal(context.userClient, context.userId, 'propose_delete_account',
    { account_id: accountId }, `Archive the ${account.name ?? 'account'} account.`, account)
}

export type SubscriptionPayload = {
  account_id: string
  name: string
  amount: number
  category: string
  frequency: typeof subscriptionFrequencies[number]
  next_due_date: string
  notes: string | null
}

function requiredDate(value: unknown): string {
  const date = requiredString(value, 'Next due date')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00.000Z`).getTime())) {
    throw new Error('Invalid next due date')
  }
  return date
}

export async function buildSubscriptionPayload(
  userClient: SupabaseClient,
  userId: string,
  args: Record<string, unknown>,
  existing?: SubscriptionPayload
): Promise<SubscriptionPayload> {
  const accountId = optionalString(optionalArg(args, 'accountId', 'account_id')) ?? existing?.account_id
  const name = optionalString(args.name) ?? existing?.name
  const amount = args.amount === undefined ? existing?.amount : requiredAmount(args.amount)
  const category = optionalString(args.category) ?? existing?.category ?? 'others'
  const frequency = optionalString(args.frequency) ?? existing?.frequency
  const nextDueDate = args.nextDueDate === undefined && args.next_due_date === undefined
    ? existing?.next_due_date
    : requiredDate(optionalArg(args, 'nextDueDate', 'next_due_date'))
  const notes = args.notes === undefined ? existing?.notes ?? null : optionalString(args.notes) ?? null

  if (!accountId) throw new Error('Account is required')
  if (!name) throw new Error('Name is required')
  if (!amount || amount <= 0) throw new Error('Amount must be greater than 0')
  if (!frequency || !subscriptionFrequencies.includes(frequency as typeof subscriptionFrequencies[number])) {
    throw new Error('Invalid subscription frequency')
  }
  if (!nextDueDate) throw new Error('Next due date is required')
  await assertAccountOwned(userClient, userId, accountId)
  return {
    account_id: accountId,
    name,
    amount,
    category,
    frequency: frequency as SubscriptionPayload['frequency'],
    next_due_date: nextDueDate,
    notes,
  }
}

export async function proposeCreateSubscription(context: ToolContext) {
  const subscription = await buildSubscriptionPayload(context.userClient, context.userId, context.args)
  return insertProposal(context.userClient, context.userId, 'propose_create_subscription', { subscription },
    `Create the ${subscription.name} subscription.`, subscription)
}

export async function proposeUpdateSubscription(context: ToolContext) {
  const subscriptionId = requiredString(context.args.subscriptionId, 'subscriptionId')
  const existing = await getOwnedRow(context.userClient, context.userId, 'subscriptions', subscriptionId)
  const subscription = await buildSubscriptionPayload(
    context.userClient, context.userId, context.args, existing as unknown as SubscriptionPayload
  )
  return insertProposal(context.userClient, context.userId, 'propose_update_subscription',
    { subscription_id: subscriptionId, subscription }, `Update the ${subscription.name} subscription.`,
    { id: subscriptionId, ...subscription })
}

export async function proposeDeleteSubscription(context: ToolContext) {
  const subscriptionId = requiredString(context.args.subscriptionId, 'subscriptionId')
  const subscription = await getOwnedRow(context.userClient, context.userId, 'subscriptions', subscriptionId)
  return insertProposal(context.userClient, context.userId, 'propose_delete_subscription',
    { subscription_id: subscriptionId }, `Delete the ${subscription.name ?? 'subscription'} subscription.`, subscription)
}

export function buildProfilePayload(args: Record<string, unknown>): Record<string, unknown> {
  const profile: Record<string, unknown> = {}
  const strings: Array<[string, string]> = [['fullName', 'full_name'], ['currency', 'currency'], ['timezone', 'timezone']]
  for (const [camel, snake] of strings) {
    const value = optionalArg(args, camel, snake)
    if (value !== undefined) {
      const parsed = optionalString(value)
      if (!parsed) throw new Error(`${snake} must not be empty`)
      profile[snake] = parsed
    }
  }
  const booleans: Array<[string, string]> = [
    ['subscriptionRemindersEnabled', 'subscription_reminders_enabled'],
    ['lowBalanceAlertsEnabled', 'low_balance_alerts_enabled'],
  ]
  for (const [camel, snake] of booleans) {
    const value = optionalArg(args, camel, snake)
    if (value !== undefined) {
      if (typeof value !== 'boolean') throw new Error(`${snake} must be boolean`)
      profile[snake] = value
    }
  }
  const threshold = optionalArg(args, 'lowBalanceThreshold', 'low_balance_threshold')
  if (threshold !== undefined) {
    const value = optionalNumber(threshold)
    if (value === undefined || value < 0) throw new Error('low_balance_threshold must not be negative')
    profile.low_balance_threshold = value
  }
  if (Object.keys(profile).length === 0) throw new Error('At least one safe profile field is required')
  return profile
}

export async function proposeUpdateProfile(context: ToolContext) {
  const profile = buildProfilePayload(context.args)
  return insertProposal(context.userClient, context.userId, 'propose_update_profile', { profile },
    'Update profile preferences.', profile)
}

export async function proposeMarkNotificationRead(context: ToolContext) {
  const notificationId = optionalString(context.args.notificationId)
  const markAll = context.args.all === true
  if (!notificationId && !markAll) throw new Error('notificationId or all=true is required')
  if (notificationId && markAll) throw new Error('Choose one notification or all notifications')
  if (notificationId) {
    const notification = await getOwnedRow(context.userClient, context.userId, 'notifications', notificationId)
    return insertProposal(context.userClient, context.userId, 'propose_mark_notification_read',
      { notification_id: notificationId }, 'Mark this notification as read.', notification)
  }
  return insertProposal(context.userClient, context.userId, 'propose_mark_notification_read',
    { all: true }, 'Mark all notifications as read.', { all: true })
}
