import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { buildTransactionPayload, type TransactionPayload } from './proposals.ts'

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

function getTransactionId(payload: Record<string, unknown>): string {
  if (typeof payload.transaction_id !== 'string' || !payload.transaction_id.trim()) {
    throw new Error('Invalid proposal payload')
  }
  return payload.transaction_id
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
  switch (proposal.tool_name) {
    case 'propose_create_transaction': {
      const transaction = await buildTransactionPayload(
        userClient,
        userId,
        getTransactionPayload(proposal.payload)
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
        getTransactionPayload(proposal.payload),
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
    default:
      throw new Error('Unsupported proposal')
  }
}
