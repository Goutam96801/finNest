import { getAuthRedirectUrl } from '@/lib/auth/sessionFromUrl'
import { ResponseType } from '@/types'
import { supabase } from '../supabase'

export type NotificationSettings = {
  subscriptionRemindersEnabled: boolean
  lowBalanceAlertsEnabled: boolean
  lowBalanceThreshold: number | null
}

export type FeedbackType = 'contact' | 'rate' | 'feedback'

function mapSettings(row: Record<string, unknown> | null): NotificationSettings {
  return {
    subscriptionRemindersEnabled: row?.subscription_reminders_enabled !== false,
    lowBalanceAlertsEnabled: row?.low_balance_alerts_enabled !== false,
    lowBalanceThreshold:
      row?.low_balance_threshold == null ? 5000 : Number(row.low_balance_threshold),
  }
}

export async function getNotificationSettings(userId: string): Promise<NotificationSettings> {
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'subscription_reminders_enabled, low_balance_alerts_enabled, low_balance_threshold'
    )
    .eq('id', userId)
    .single()

  if (error) throw error
  return mapSettings(data as Record<string, unknown>)
}

export async function updateNotificationSettings(
  userId: string,
  settings: NotificationSettings
): Promise<ResponseType> {
  const { error } = await supabase
    .from('profiles')
    .update({
      subscription_reminders_enabled: settings.subscriptionRemindersEnabled,
      low_balance_alerts_enabled: settings.lowBalanceAlertsEnabled,
      low_balance_threshold: settings.lowBalanceThreshold,
    })
    .eq('id', userId)

  if (error) return { success: false, msg: error.message }
  return { success: true, msg: 'Settings saved' }
}

export async function submitFeedback(
  userId: string,
  payload: { type: FeedbackType; message?: string; rating?: number }
): Promise<ResponseType> {
  const { error } = await supabase.from('feedback').insert({
    user_id: userId,
    type: payload.type,
    message: payload.message?.trim() || null,
    rating: payload.rating ?? null,
  })

  if (error) return { success: false, msg: error.message }
  return { success: true, msg: 'Thanks for your feedback' }
}

export async function changePassword(newPassword: string): Promise<ResponseType> {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) return { success: false, msg: error.message }
  return { success: true, msg: 'Password updated' }
}

export async function changeEmail(newEmail: string): Promise<ResponseType> {
  const email = newEmail.trim()
  if (!email) return { success: false, msg: 'Enter a valid email' }

  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: getAuthRedirectUrl('auth/callback') }
  )
  if (error) return { success: false, msg: error.message }
  return {
    success: true,
    msg: 'We sent a confirmation link. Open it on this device to finish updating your email.',
  }
}

export type DataExport = {
  id: string
  userId: string
  format: 'csv' | 'pdf'
  storagePath: string
  fileName: string
  createdAt: string
}

type DataExportRow = {
  id: string
  user_id: string
  format: 'csv' | 'pdf'
  storage_path: string
  file_name: string
  created_at: string
}

function mapExport(row: DataExportRow): DataExport {
  return {
    id: row.id,
    userId: row.user_id,
    format: row.format,
    storagePath: row.storage_path,
    fileName: row.file_name,
    createdAt: row.created_at,
  }
}

export async function listDataExports(userId: string): Promise<DataExport[]> {
  const { data, error } = await supabase
    .from('data_exports')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) throw error
  return ((data ?? []) as DataExportRow[]).map(mapExport)
}

export async function generateTransactionExport(
  format: 'csv' | 'pdf'
): Promise<ResponseType & { data?: DataExport }> {
  const { data, error } = await supabase.functions.invoke('export-transactions', {
    body: { format },
  })

  if (error) return { success: false, msg: error.message }
  if (data?.error) return { success: false, msg: String(data.error) }
  return {
    success: true,
    msg: data?.message || 'Export ready',
    data: data?.export ? mapExport(data.export as DataExportRow) : undefined,
  }
}

export async function getExportDownloadUrl(
  storagePath: string
): Promise<ResponseType & { url?: string }> {
  const { data, error } = await supabase.storage
    .from('exports')
    .createSignedUrl(storagePath, 60 * 10)

  if (error) return { success: false, msg: error.message }
  return { success: true, url: data.signedUrl }
}

export async function requestAccountDeletion(): Promise<ResponseType> {
  const { data, error } = await supabase.functions.invoke('delete-account', {
    method: 'POST',
  })

  if (error) return { success: false, msg: error.message }
  if (data?.error) return { success: false, msg: String(data.error) }
  return { success: true, msg: data?.message || 'Account disabled' }
}
