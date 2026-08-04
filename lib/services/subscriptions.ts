import { createNotification } from '@/lib/services/notifications'
import { createTransaction } from '@/lib/services/transactions'
import { ResponseType } from '@/types'
import { supabase } from '../supabase'

function queueReminderResync(userId: string) {
  void import('@/lib/services/localReminders')
    .then(({ resyncSubscriptionRemindersForUser }) =>
      resyncSubscriptionRemindersForUser(userId)
    )
    .catch((err) => console.log('Reminder resync failed', err))
}

export type SubscriptionFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export type Subscription = {
  id: string
  userId: string
  accountId: string
  name: string
  amount: number
  category: string
  frequency: SubscriptionFrequency
  nextDueDate: string
  notes?: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

type SubscriptionRow = {
  id: string
  user_id: string
  account_id: string
  name: string
  amount: number
  category: string
  frequency: SubscriptionFrequency
  next_due_date: string
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export function mapSubscription(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    userId: row.user_id,
    accountId: row.account_id,
    name: row.name,
    amount: Number(row.amount),
    category: row.category,
    frequency: row.frequency,
    nextDueDate: row.next_due_date,
    notes: row.notes,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function addDays(dateStr: string, days: number) {
  const date = new Date(`${dateStr}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function advanceDueDate(dateStr: string, frequency: SubscriptionFrequency) {
  const date = new Date(`${dateStr}T00:00:00.000Z`)
  switch (frequency) {
    case 'daily':
      date.setUTCDate(date.getUTCDate() + 1)
      break
    case 'weekly':
      date.setUTCDate(date.getUTCDate() + 7)
      break
    case 'monthly':
      date.setUTCMonth(date.getUTCMonth() + 1)
      break
    case 'quarterly':
      date.setUTCMonth(date.getUTCMonth() + 3)
      break
    case 'yearly':
      date.setUTCFullYear(date.getUTCFullYear() + 1)
      break
  }
  return date.toISOString().slice(0, 10)
}

export async function getSubscriptions(userId: string) {
  if (!userId) throw new Error('User not authenticated')

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('next_due_date', { ascending: true })

  if (error) throw error
  return (data as SubscriptionRow[]).map(mapSubscription)
}

export async function getSubscriptionById(userId: string, subscriptionId: string) {
  if (!userId) throw new Error('User not authenticated')

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('id', subscriptionId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return mapSubscription(data as SubscriptionRow)
}

export async function getUpcomingSubscriptions(userId: string, withinDays = 14) {
  const all = await getSubscriptions(userId)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const limit = new Date(today)
  limit.setDate(limit.getDate() + withinDays)

  return all.filter((item) => {
    const due = new Date(`${item.nextDueDate}T00:00:00`)
    return due <= limit
  })
}

export async function createSubscription(
  userId: string,
  input: {
    name: string
    amount: number
    accountId: string
    category: string
    frequency: SubscriptionFrequency
    nextDueDate: string
    notes?: string | null
  }
): Promise<ResponseType> {
  if (!userId) return { success: false, msg: 'User not authenticated' }
  if (!input.name.trim()) return { success: false, msg: 'Name is required' }
  if (!input.accountId) return { success: false, msg: 'Select an account' }
  if (!(input.amount > 0)) return { success: false, msg: 'Amount must be greater than 0' }

  const { data, error } = await supabase
    .from('subscriptions')
    .insert({
      user_id: userId,
      account_id: input.accountId,
      name: input.name.trim(),
      amount: input.amount,
      category: input.category || 'others',
      frequency: input.frequency,
      next_due_date: input.nextDueDate,
      notes: input.notes?.trim() || null,
      is_active: true,
    })
    .select()
    .single()

  if (error) return { success: false, msg: error.message }

  await createNotification(userId, {
    type: 'subscription_due',
    title: `${input.name.trim()} reminder set`,
    body: `Due on ${input.nextDueDate}`,
    data: { subscriptionId: data.id },
  })

  queueReminderResync(userId)

  return { success: true, data: mapSubscription(data as SubscriptionRow), msg: 'Subscription added' }
}

export async function updateSubscription(
  userId: string,
  subscriptionId: string,
  input: {
    name: string
    amount: number
    accountId: string
    category: string
    frequency: SubscriptionFrequency
    nextDueDate: string
    notes?: string | null
  }
): Promise<ResponseType> {
  if (!userId) return { success: false, msg: 'User not authenticated' }
  if (!subscriptionId) return { success: false, msg: 'Subscription not found' }
  if (!input.name.trim()) return { success: false, msg: 'Name is required' }
  if (!input.accountId) return { success: false, msg: 'Select an account' }
  if (!(input.amount > 0)) return { success: false, msg: 'Amount must be greater than 0' }

  const { data, error } = await supabase
    .from('subscriptions')
    .update({
      account_id: input.accountId,
      name: input.name.trim(),
      amount: input.amount,
      category: input.category || 'others',
      frequency: input.frequency,
      next_due_date: input.nextDueDate,
      notes: input.notes?.trim() || null,
    })
    .eq('id', subscriptionId)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) return { success: false, msg: error.message }
  queueReminderResync(userId)
  return { success: true, data: mapSubscription(data as SubscriptionRow), msg: 'Subscription updated' }
}

export async function markSubscriptionPaid(userId: string, subscriptionId: string): Promise<ResponseType> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('id', subscriptionId)
    .eq('user_id', userId)
    .single()

  if (error || !data) return { success: false, msg: error?.message || 'Subscription not found' }

  const sub = mapSubscription(data as SubscriptionRow)

  const txn = await createTransaction(userId, {
    type: 'expense',
    accountId: sub.accountId,
    category: sub.category,
    amount: sub.amount,
    notes: sub.notes || `Paid ${sub.name}`,
    description: `Paid ${sub.name}`,
    date: new Date().toISOString(),
    status: 'completed',
  })

  if (!txn.success) return txn

  const nextDue = advanceDueDate(sub.nextDueDate, sub.frequency)
  const { error: updateError } = await supabase
    .from('subscriptions')
    .update({ next_due_date: nextDue })
    .eq('id', subscriptionId)
    .eq('user_id', userId)

  if (updateError) return { success: false, msg: updateError.message }

  await createNotification(userId, {
    type: 'subscription_paid',
    title: `${sub.name} marked paid`,
    body: `Next due ${nextDue}`,
    data: { subscriptionId },
  })

  queueReminderResync(userId)

  return { success: true, msg: 'Marked as paid' }
}

export async function snoozeSubscription(
  userId: string,
  subscriptionId: string,
  days = 3
): Promise<ResponseType> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('id', subscriptionId)
    .eq('user_id', userId)
    .single()

  if (error || !data) return { success: false, msg: error?.message || 'Subscription not found' }

  const sub = mapSubscription(data as SubscriptionRow)
  const nextDue = addDays(sub.nextDueDate, days)

  const { error: updateError } = await supabase
    .from('subscriptions')
    .update({ next_due_date: nextDue })
    .eq('id', subscriptionId)
    .eq('user_id', userId)

  if (updateError) return { success: false, msg: updateError.message }

  await createNotification(userId, {
    type: 'subscription_due',
    title: `${sub.name} snoozed`,
    body: `Now due on ${nextDue}`,
    data: { subscriptionId },
  })

  queueReminderResync(userId)

  return { success: true, msg: `Snoozed by ${days} days` }
}

export async function skipSubscription(userId: string, subscriptionId: string): Promise<ResponseType> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('id', subscriptionId)
    .eq('user_id', userId)
    .single()

  if (error || !data) return { success: false, msg: error?.message || 'Subscription not found' }

  const sub = mapSubscription(data as SubscriptionRow)
  const nextDue = advanceDueDate(sub.nextDueDate, sub.frequency)

  const { error: updateError } = await supabase
    .from('subscriptions')
    .update({ next_due_date: nextDue })
    .eq('id', subscriptionId)
    .eq('user_id', userId)

  if (updateError) return { success: false, msg: updateError.message }

  await createNotification(userId, {
    type: 'system',
    title: `${sub.name} skipped`,
    body: `Next due ${nextDue}`,
    data: { subscriptionId },
  })

  queueReminderResync(userId)

  return { success: true, msg: 'Skipped this cycle' }
}
