import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  buildAccountPayload,
  buildProfilePayload,
  buildSubscriptionPayload,
  buildTransactionPayload,
  type AccountPayload,
  type SubscriptionPayload,
  type TransactionPayload,
} from './proposals.ts'

type Proposal = {
  tool_name: string
  payload: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getTransactionPayload(payload: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(payload.transaction)) throw new Error('Invalid proposal payload')
  return payload.transaction
}

function getTransactionArgs(payload: Record<string, unknown>): Record<string, unknown> {
  const transaction = getTransactionPayload(payload)
  return {
    accountId: transaction.account_id,
    toAccountId: transaction.to_account_id,
    type: transaction.type,
    category: transaction.category,
    amount: transaction.amount,
    description: transaction.description,
    status: transaction.status,
    transactionDate: transaction.transaction_date,
  }
}

function getTransactionId(payload: Record<string, unknown>): string {
  if (typeof payload.transaction_id !== 'string' || !payload.transaction_id.trim()) {
    throw new Error('Invalid proposal payload')
  }
  return payload.transaction_id
}

function getPayloadObject(payload: Record<string, unknown>, key: string): Record<string, unknown> {
  if (!isRecord(payload[key])) throw new Error('Invalid proposal payload')
  return payload[key]
}

function getPayloadId(payload: Record<string, unknown>, key: string): string {
  const value = payload[key]
  if (typeof value !== 'string' || !value.trim()) throw new Error('Invalid proposal payload')
  return value
}

async function getExistingTransaction(
  userClient: SupabaseClient,
  userId: string,
  transactionId: string
): Promise<TransactionPayload> {
  const { data, error } = await userClient
    .from('transactions')
    .select('account_id, to_account_id, type, category, amount, description, status, transaction_date')
    .eq('id', transactionId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Transaction not found')
  return data as TransactionPayload
}

export async function applyProposal(
  userClient: SupabaseClient,
  userId: string,
  proposal: Proposal
): Promise<unknown> {
  // Known limitation: some proposal handlers require multiple database writes, but
  // this Edge Function has no transaction boundary. A later failure can leave an
  // earlier write applied; confirm currently rolls the proposal back to pending,
  // so retrying can repeat side effects. Move these handlers into transactional
  // Postgres RPCs (or make them idempotent) before treating retries as safe.
  switch (proposal.tool_name) {
    case 'propose_create_transaction': {
      const transaction = await buildTransactionPayload(
        userClient,
        userId,
        getTransactionArgs(proposal.payload)
      )
      const { data, error } = await userClient
        .from('transactions')
        .insert({ user_id: userId, ...transaction })
        .select()
        .single()
      if (error) throw error
      return data
    }
    case 'propose_update_transaction': {
      const transactionId = getTransactionId(proposal.payload)
      const existing = await getExistingTransaction(userClient, userId, transactionId)
      const transaction = await buildTransactionPayload(
        userClient,
        userId,
        getTransactionArgs(proposal.payload),
        existing
      )
      const { data, error } = await userClient
        .from('transactions')
        .update(transaction)
        .eq('id', transactionId)
        .eq('user_id', userId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    case 'propose_delete_transaction': {
      const transactionId = getTransactionId(proposal.payload)
      const { error } = await userClient
        .from('transactions')
        .delete()
        .eq('id', transactionId)
        .eq('user_id', userId)
      if (error) throw error
      return { id: transactionId }
    }
    case 'propose_create_account': {
      const account = buildAccountPayload(getPayloadObject(proposal.payload, 'account'))
      const activeAccountCount = await getActiveAccountCount(userClient, userId)
      const isPrimary = activeAccountCount === 0 || account.is_primary
      if (isPrimary && activeAccountCount > 0) await clearOtherPrimaryAccounts(userClient, userId)
      const { data, error } = await userClient
        .from('accounts')
        .insert({ user_id: userId, ...account, is_primary: isPrimary, is_archived: false, display_order: 0 })
        .select()
        .single()
      if (error) throw error
      return data
    }
    case 'propose_update_account': {
      const accountId = getPayloadId(proposal.payload, 'account_id')
      const existing = await getExistingAccount(userClient, userId, accountId)
      const account = buildAccountPayload(getPayloadObject(proposal.payload, 'account'), existing)
      const isPrimary = (await getActiveAccountCount(userClient, userId)) <= 1 || account.is_primary
      if (isPrimary) await clearOtherPrimaryAccounts(userClient, userId, accountId)
      const { balance: _ignoredBalance, ...update } = account
      const { data, error } = await userClient
        .from('accounts')
        .update({ ...update, is_primary: isPrimary })
        .eq('id', accountId)
        .eq('user_id', userId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    case 'propose_delete_account': {
      const accountId = getPayloadId(proposal.payload, 'account_id')
      const account = await getExistingAccount(userClient, userId, accountId)
      if (account.is_archived) throw new Error('Account is already archived')
      const { error } = await userClient
        .from('accounts')
        .update({ is_archived: true, is_primary: false })
        .eq('id', accountId)
        .eq('user_id', userId)
      if (error) throw error
      if (account.is_primary) {
        const { data: replacement, error: replacementError } = await userClient
          .from('accounts')
          .select('id')
          .eq('user_id', userId)
          .eq('is_archived', false)
          .order('display_order', { ascending: true })
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (replacementError) throw replacementError
        if (replacement?.id) {
          const { error: primaryError } = await userClient
            .from('accounts')
            .update({ is_primary: true })
            .eq('id', replacement.id)
            .eq('user_id', userId)
          if (primaryError) throw primaryError
        }
      }
      return { id: accountId }
    }
    case 'propose_create_subscription': {
      const subscription = await buildSubscriptionPayload(
        userClient, userId, getPayloadObject(proposal.payload, 'subscription')
      )
      const { data, error } = await userClient
        .from('subscriptions')
        .insert({ user_id: userId, ...subscription, is_active: true })
        .select()
        .single()
      if (error) throw error
      const { error: notificationError } = await userClient
        .from('notifications')
        .insert({
          user_id: userId,
          type: 'subscription_due',
          title: `${subscription.name} reminder set`,
          body: `Due on ${subscription.next_due_date}`,
          data: { subscriptionId: data.id },
        })
        .select()
        .single()
      if (notificationError) {
        // The subscription already exists, so do not roll back the proposal and
        // invite a retry that creates a duplicate subscription.
        console.error(JSON.stringify({
          event: 'fynn_subscription_notification_failed',
          user_id: userId,
          tool_name: proposal.tool_name,
          error_code: 'NOTIFICATION_INSERT_FAILED',
        }))
      }
      return { data, reminderResyncRequired: true }
    }
    case 'propose_update_subscription': {
      const subscriptionId = getPayloadId(proposal.payload, 'subscription_id')
      const existing = await getExistingSubscription(userClient, userId, subscriptionId)
      const subscription = await buildSubscriptionPayload(
        userClient, userId, getPayloadObject(proposal.payload, 'subscription'), existing
      )
      const { data, error } = await userClient
        .from('subscriptions')
        .update(subscription)
        .eq('id', subscriptionId)
        .eq('user_id', userId)
        .select()
        .single()
      if (error) throw error
      return { data, reminderResyncRequired: true }
    }
    case 'propose_delete_subscription': {
      const subscriptionId = getPayloadId(proposal.payload, 'subscription_id')
      await getExistingSubscription(userClient, userId, subscriptionId)
      const { error } = await userClient
        .from('subscriptions')
        .delete()
        .eq('id', subscriptionId)
        .eq('user_id', userId)
      if (error) throw error
      return { id: subscriptionId }
    }
    case 'propose_update_profile': {
      const profile = buildProfilePayload(getPayloadObject(proposal.payload, 'profile'))
      const { data, error } = await userClient
        .from('profiles')
        .update(profile)
        .eq('id', userId)
        .select()
        .single()
      if (error) throw error
      if (typeof profile.full_name === 'string') {
        const { error: authError } = await userClient.auth.updateUser({
          data: { display_name: profile.full_name },
        })
        if (authError) throw authError
      }
      return data
    }
    case 'propose_mark_notification_read': {
      if (proposal.payload.all === true) {
        const { error } = await userClient
          .from('notifications')
          .update({ is_read: true })
          .eq('user_id', userId)
          .eq('is_read', false)
        if (error) throw error
        return { all: true }
      }
      const notificationId = getPayloadId(proposal.payload, 'notification_id')
      const { data, error } = await userClient
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .eq('user_id', userId)
        .select()
        .single()
      if (error) throw error
      return data
    }
    default:
      throw new Error('Unsupported proposal')
  }
}

async function getExistingAccount(
  userClient: SupabaseClient,
  userId: string,
  accountId: string
): Promise<AccountPayload & { is_archived: boolean }> {
  const { data, error } = await userClient
    .from('accounts')
    .select('name, type, balance, color, icon, account_number_last4, bank_name, credit_limit, is_primary, notes, is_archived')
    .eq('id', accountId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Account not found')
  return data as AccountPayload & { is_archived: boolean }
}

async function getExistingSubscription(
  userClient: SupabaseClient,
  userId: string,
  subscriptionId: string
): Promise<SubscriptionPayload> {
  const { data, error } = await userClient
    .from('subscriptions')
    .select('account_id, name, amount, category, frequency, next_due_date, notes')
    .eq('id', subscriptionId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Subscription not found')
  return data as SubscriptionPayload
}

async function getActiveAccountCount(userClient: SupabaseClient, userId: string) {
  const { data, error } = await userClient
    .from('accounts')
    .select('id')
    .eq('user_id', userId)
    .eq('is_archived', false)
  if (error) throw error
  return data?.length ?? 0
}

async function clearOtherPrimaryAccounts(userClient: SupabaseClient, userId: string, exceptAccountId?: string) {
  let query = userClient
    .from('accounts')
    .update({ is_primary: false })
    .eq('user_id', userId)
    .eq('is_archived', false)
    .eq('is_primary', true)
  if (exceptAccountId) query = query.neq('id', exceptAccountId)
  const { error } = await query
  if (error) throw error
}
