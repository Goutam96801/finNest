import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  getProfile,
  getTransaction,
  listAccounts,
  listNotifications,
  listSubscriptions,
  listTransactions,
} from './reads.ts'
import {
  proposeCreateAccount,
  proposeCreateSubscription,
  proposeCreateTransaction,
  proposeDeleteAccount,
  proposeDeleteSubscription,
  proposeDeleteTransaction,
  proposeMarkNotificationRead,
  proposeUpdateAccount,
  proposeUpdateProfile,
  proposeUpdateSubscription,
  proposeUpdateTransaction,
} from './proposals.ts'

type ExecuteToolInput = {
  name: string
  args: Record<string, unknown>
  userId: string
  userClient: SupabaseClient
}

export async function executeTool(
  input: ExecuteToolInput
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  try {
    let result: unknown

    switch (input.name) {
      case 'list_accounts':
        result = await listAccounts(input)
        break
      case 'list_transactions':
        result = await listTransactions(input)
        break
      case 'get_transaction':
        result = await getTransaction(input)
        break
      case 'list_subscriptions':
        result = await listSubscriptions(input)
        break
      case 'get_profile':
        result = await getProfile(input)
        break
      case 'list_notifications':
        result = await listNotifications(input)
        break
      case 'propose_create_transaction':
        result = await proposeCreateTransaction(input)
        break
      case 'propose_update_transaction':
        result = await proposeUpdateTransaction(input)
        break
      case 'propose_delete_transaction':
        result = await proposeDeleteTransaction(input)
        break
      case 'propose_create_account':
        result = await proposeCreateAccount(input)
        break
      case 'propose_update_account':
        result = await proposeUpdateAccount(input)
        break
      case 'propose_delete_account':
        result = await proposeDeleteAccount(input)
        break
      case 'propose_create_subscription':
        result = await proposeCreateSubscription(input)
        break
      case 'propose_update_subscription':
        result = await proposeUpdateSubscription(input)
        break
      case 'propose_delete_subscription':
        result = await proposeDeleteSubscription(input)
        break
      case 'propose_update_profile':
        result = await proposeUpdateProfile(input)
        break
      case 'propose_mark_notification_read':
        result = await proposeMarkNotificationRead(input)
        break
      default:
        return { ok: false, error: 'Unknown tool' }
    }

    return { ok: true, result }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Tool execution failed',
    }
  }
}
