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
