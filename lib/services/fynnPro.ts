import { supabase } from '@/lib/supabase'
import { Platform } from 'react-native'

export const FYNN_DAILY_LIMIT = 20

export type FynnPlanId = 'monthly' | 'yearly'

export type FynnProStatus = {
  subscribed: boolean
  plan: FynnPlanId | null
  periodEnd: string | null
  used: number
  limit: number
  resetsAt: string | null
}

export type FynnPurchase = {
  id: string
  plan: FynnPlanId
  amountPaise: number
  status: 'created' | 'paid' | 'failed'
  razorpayOrderId: string
  periodStart: string | null
  periodEnd: string | null
  createdAt: string
}

type StatusRow = {
  subscribed?: boolean
  plan?: string | null
  period_end?: string | null
  used?: number
  limit?: number
  resets_at?: string | null
}

export function parseFynnProStatus(row: StatusRow | null | undefined): FynnProStatus {
  const plan = row?.plan === 'yearly' || row?.plan === 'monthly' ? row.plan : null
  return {
    subscribed: row?.subscribed === true,
    plan,
    periodEnd: row?.period_end ?? null,
    used: Number(row?.used ?? 0),
    limit: Number(row?.limit ?? FYNN_DAILY_LIMIT),
    resetsAt: row?.resets_at ?? null,
  }
}

export async function getFynnProStatus(): Promise<FynnProStatus> {
  const { data, error } = await supabase.rpc('get_fynn_pro_status')
  if (error) throw new Error(error.message)
  const row = typeof data === 'string' ? JSON.parse(data) : data
  return parseFynnProStatus(row as StatusRow)
}

export async function listFynnPurchases(): Promise<FynnPurchase[]> {
  const { data, error } = await supabase
    .from('fynn_purchases')
    .select('id, plan, amount_paise, status, razorpay_order_id, period_start, period_end, created_at')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    id: row.id,
    plan: row.plan === 'yearly' ? 'yearly' : 'monthly',
    amountPaise: row.amount_paise,
    status: row.status,
    razorpayOrderId: row.razorpay_order_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    createdAt: row.created_at,
  }))
}

export async function getPurchaseByOrderId(orderId: string): Promise<FynnPurchase | null> {
  const { data, error } = await supabase
    .from('fynn_purchases')
    .select('id, plan, amount_paise, status, razorpay_order_id, period_start, period_end, created_at')
    .eq('razorpay_order_id', orderId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    id: data.id,
    plan: data.plan === 'yearly' ? 'yearly' : 'monthly',
    amountPaise: data.amount_paise,
    status: data.status,
    razorpayOrderId: data.razorpay_order_id,
    periodStart: data.period_start,
    periodEnd: data.period_end,
    createdAt: data.created_at,
  }
}

export async function createFynnOrder(plan: FynnPlanId): Promise<{
  keyId: string
  orderId: string
  amount: number
  currency: string
  description: string
}> {
  const { data, error } = await supabase.functions.invoke('fynn-create-order', {
    body: { plan },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(String(data.error))
  return {
    keyId: String(data.keyId),
    orderId: String(data.orderId),
    amount: Number(data.amount),
    currency: String(data.currency ?? 'INR'),
    description: String(data.description ?? 'Fynn Pro'),
  }
}

export async function waitForPaidOrder(orderId: string, timeoutMs = 15000): Promise<boolean> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const purchase = await getPurchaseByOrderId(orderId)
    if (purchase?.status === 'paid') return true
    if (purchase?.status === 'failed') return false
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  return false
}

type CheckoutPrefill = { email?: string | null; name?: string | null }

export async function openFynnCheckout(
  plan: FynnPlanId,
  prefill: CheckoutPrefill,
): Promise<'paid' | 'pending' | 'cancelled'> {
  if (Platform.OS !== 'android') {
    throw new Error('Fynn Pro checkout is available on Android.')
  }

  const order = await createFynnOrder(plan)
  let RazorpayCheckout: { open: (options: Record<string, unknown>) => Promise<unknown> }
  try {
    // Lazy load so Expo Go / EAS Update can boot without the native SDK.
    const mod = await import('react-native-razorpay')
    RazorpayCheckout = mod.default
  } catch {
    throw new Error('Razorpay native module is missing. Build with npx expo run:android.')
  }
  if (typeof RazorpayCheckout?.open !== 'function') {
    throw new Error('Razorpay native module is missing. Build with npx expo run:android.')
  }

  try {
    await RazorpayCheckout.open({
      key: order.keyId || process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID,
      order_id: order.orderId,
      name: 'FinNest',
      description: order.description,
      currency: order.currency,
      amount: order.amount,
      prefill: {
        email: prefill.email ?? '',
        name: prefill.name ?? '',
      },
      theme: { color: '#a3e635' },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (/cancel/i.test(message) || message === 'undefined') return 'cancelled'
    const code = (e as { code?: number })?.code
    if (code === 0 || code === 2) return 'cancelled'
    throw (e instanceof Error ? e : new Error(message || 'Checkout failed'))
  }

  const paid = await waitForPaidOrder(order.orderId)
  return paid ? 'paid' : 'pending'
}
