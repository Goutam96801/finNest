import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  getProfile,
  getTransaction,
  listAccounts,
  listNotifications,
  listSubscriptions,
  listTransactions,
} from './reads.ts'

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
