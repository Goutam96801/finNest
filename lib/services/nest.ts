import { ResponseType } from '@/types'
import { supabase } from '@/lib/supabase'
import * as WebBrowser from 'expo-web-browser'

export type NestStatus = {
  nestActive: boolean
  nestStatus: string | null
  nestPriceId: string | null
  nestRenewsAt: string | null
  razorpayCustomerId: string | null
  razorpaySubscriptionId: string | null
}

WebBrowser.maybeCompleteAuthSession()

export async function getNestStatus(userId: string): Promise<NestStatus> {
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'nest_active, nest_status, nest_price_id, nest_renews_at, razorpay_customer_id, razorpay_subscription_id'
    )
    .eq('id', userId)
    .single()

  if (error) throw error

  return {
    nestActive: Boolean(data?.nest_active),
    nestStatus: data?.nest_status ?? null,
    nestPriceId: data?.nest_price_id ?? null,
    nestRenewsAt: data?.nest_renews_at ?? null,
    razorpayCustomerId: data?.razorpay_customer_id ?? null,
    razorpaySubscriptionId: data?.razorpay_subscription_id ?? null,
  }
}

export type NestPlan = 'monthly' | 'yearly'

export async function startNestCheckout(
  plan: NestPlan
): Promise<ResponseType & { url?: string }> {
  const { data, error } = await supabase.functions.invoke('create-nest-checkout', {
    body: { plan },
  })

  if (error) return { success: false, msg: error.message }
  if (data?.error) return { success: false, msg: String(data.error) }
  if (!data?.url) return { success: false, msg: 'Checkout URL missing' }

  // Razorpay hosted auth URL (UPI / cards). User returns to the app manually;
  // NestProvider refreshes on AppState active + success screen if deep-linked.
  await WebBrowser.openBrowserAsync(String(data.url), {
    enableBarCollapsing: true,
    showInRecents: true,
  })

  return { success: true, url: String(data.url), msg: 'Checkout opened' }
}

/** Cancel Nest at end of current Razorpay billing cycle. */
export async function cancelNestAtPeriodEnd(): Promise<ResponseType> {
  const { data, error } = await supabase.functions.invoke('create-nest-portal', {
    body: { action: 'cancel' },
  })

  if (error) return { success: false, msg: error.message }
  if (data?.error) return { success: false, msg: String(data.error) }
  return { success: true, msg: data?.message || 'Nest will cancel at period end' }
}

export async function resumeNestSubscription(): Promise<ResponseType> {
  const { data, error } = await supabase.functions.invoke('create-nest-portal', {
    body: { action: 'resume' },
  })

  if (error) return { success: false, msg: error.message }
  if (data?.error) return { success: false, msg: String(data.error) }
  return { success: true, msg: data?.message || 'Nest continues' }
}

export function formatNestRenewsAt(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function nestDisplayName(hasNest: boolean) {
  return hasNest ? 'FinNest' : 'Fin'
}
