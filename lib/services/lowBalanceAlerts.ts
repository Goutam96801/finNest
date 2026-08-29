import { getAccounts } from '@/lib/services/accounts'
import { createNotification, type AppNotification } from '@/lib/services/notifications'
import { getNotificationSettings } from '@/lib/services/settings'
import { supabase } from '@/lib/supabase'

const ALERTABLE_TYPES = new Set(['bank', 'cash', 'wallet', 'other'])

function startOfLocalDayIso() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return start.toISOString()
}

/**
 * Creates at most one in-app low-balance notification per account per day
 * when Settings → Low balance alerts is on and the live balance is under
 * the user's threshold.
 */
export async function reconcileLowBalanceAlerts(userId: string) {
  if (!userId) return
  try {
    const settings = await getNotificationSettings(userId)
    if (!settings.lowBalanceAlertsEnabled) return

    const threshold = Number(settings.lowBalanceThreshold ?? 0)
    if (!(threshold > 0)) return

    const accounts = (await getAccounts(userId)).filter(
      (account) => !account.isArchived && ALERTABLE_TYPES.has(account.type || '')
    )

    const { data, error } = await supabase
      .from('notifications')
      .select('id, data')
      .eq('user_id', userId)
      .eq('type', 'low_balance')
      .gte('created_at', startOfLocalDayIso())

    if (error) throw error

    const already = new Set(
      (data ?? [])
        .map((row) => (row.data as Record<string, unknown> | null)?.accountId)
        .filter((id): id is string => typeof id === 'string')
    )

    for (const account of accounts) {
      const balance = Number(account.balance ?? 0)
      if (balance >= threshold) continue
      if (!account.id || already.has(account.id)) continue

      await createNotification(userId, {
        type: 'low_balance',
        title: `${account.name || 'Account'} is running low`,
        body: `Balance ₹${balance.toLocaleString('en-IN')} is under your ₹${threshold.toLocaleString('en-IN')} alert`,
        data: {
          accountId: account.id,
          threshold,
          balance,
        },
      })
    }
  } catch (error) {
    console.log('Failed to reconcile low-balance alerts', error)
  }
}

export function queueLowBalanceCheck(userId: string) {
  void reconcileLowBalanceAlerts(userId)
}

export function isLowBalanceNotification(item: AppNotification) {
  return item.type === 'low_balance'
}
