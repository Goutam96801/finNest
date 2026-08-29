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
  params: { limit?: number; offset?: number; unreadOnly?: boolean } = {}
) {
  if (!userId) throw new Error('User not authenticated')

  const limit = params.limit ?? 20
  const offset = params.offset ?? 0

  let query = supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (params.unreadOnly) query = query.eq('is_read', false)

  const { data, error } = await query

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

export async function deleteNotification(userId: string, notificationId: string): Promise<ResponseType> {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId)
    .eq('user_id', userId)

  if (error) return { success: false, msg: error.message }
  return { success: true }
}

export function formatRelativeTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const diffMs = Date.now() - date.getTime()
  const minutes = Math.max(0, Math.floor(diffMs / 60000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatNotificationDayLabel(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const diffDays = Math.round((startOfToday - startOfDay) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}

export function isSameCalendarDay(a: string, b: string) {
  const left = new Date(a)
  const right = new Date(b)
  return (
    left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
  )
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
