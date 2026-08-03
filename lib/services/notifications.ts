import { ResponseType } from '@/types'
import { supabase } from '../supabase'

export type AppNotification = {
  id: string
  userId: string
  type: 'subscription_due' | 'subscription_paid' | 'low_balance' | 'system'
  title: string
  body?: string | null
  data?: Record<string, unknown>
  isRead: boolean
  createdAt: string
}

type NotificationRow = {
  id: string
  user_id: string
  type: AppNotification['type']
  title: string
  body: string | null
  data: Record<string, unknown> | null
  is_read: boolean
  created_at: string
}

function sanitizeNotificationText(value: string | null | undefined) {
  if (!value) return value ?? null
  // Seed/DB encoding can turn ₹ into ???; restore from the JS string literal.
  return value.replace(/\?{2,3}(?=[\d,])/g, '₹').replace(/\uFFFD(?=[\d,])/g, '₹')
}

export function mapNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: sanitizeNotificationText(row.title) || row.title,
    body: sanitizeNotificationText(row.body),
    data: row.data ?? {},
    isRead: row.is_read,
    createdAt: row.created_at,
  }
}

export async function getNotifications(userId: string) {
  if (!userId) throw new Error('User not authenticated')

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw error
  return (data as NotificationRow[]).map(mapNotification)
}

export async function getNotificationsPage(
  userId: string,
  params: { limit?: number; offset?: number } = {}
) {
  if (!userId) throw new Error('User not authenticated')

  const limit = params.limit ?? 20
  const offset = params.offset ?? 0

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw error

  const items = (data as NotificationRow[]).map(mapNotification)
  return { items, hasMore: items.length === limit }
}

export async function getUnreadNotificationCount(userId: string) {
  if (!userId) throw new Error('User not authenticated')

  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)

  if (error) throw error
  return count ?? 0
}

export async function markNotificationRead(userId: string, notificationId: string): Promise<ResponseType> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('user_id', userId)

  if (error) return { success: false, msg: error.message }
  return { success: true }
}

export async function markAllNotificationsRead(userId: string): Promise<ResponseType> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false)

  if (error) return { success: false, msg: error.message }
  return { success: true }
}

export async function createNotification(
  userId: string,
  payload: {
    type: AppNotification['type']
    title: string
    body?: string
    data?: Record<string, unknown>
  }
): Promise<ResponseType> {
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      type: payload.type,
      title: payload.title,
      body: payload.body ?? null,
      data: payload.data ?? {},
    })
    .select()
    .single()

  if (error) return { success: false, msg: error.message }
  return { success: true, data: mapNotification(data as NotificationRow) }
}
