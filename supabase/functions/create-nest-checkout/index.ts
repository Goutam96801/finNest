import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function razorpayAuthHeader() {
  const keyId = Deno.env.get('RAZORPAY_KEY_ID')
  const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET')
  if (!keyId || !keySecret) return null
  return 'Basic ' + btoa(`${keyId}:${keySecret}`)
}

async function razorpayFetch(path: string, init: RequestInit = {}) {
  const auth = razorpayAuthHeader()
  if (!auth) throw new Error('Razorpay is not configured')
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.error?.description || data?.error?.reason || `Razorpay ${res.status}`
    throw new Error(msg)
  }
  return data
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization' }, 401)

    const planMonthly = Deno.env.get('RAZORPAY_PLAN_NEST_MONTHLY')
    const planYearly = Deno.env.get('RAZORPAY_PLAN_NEST_YEARLY')
    if (!planMonthly || !planYearly || !razorpayAuthHeader()) {
      return json({ error: 'Razorpay is not configured' }, 500)
    }

    const body = await req.json().catch(() => ({}))
    const plan = body?.plan === 'yearly' ? 'yearly' : 'monthly'
    const planId = plan === 'yearly' ? planYearly : planMonthly
    // Razorpay requires total_count; use a long runway for "ongoing" Nest.
    const totalCount = plan === 'yearly' ? 20 : 120
    // Auth payment link validity (matches Dashboard-style subscription links).
    const expireBy = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60

    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) return json({ error: 'Unauthorized' }, 401)

    const admin = createClient(url, service)
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id, nest_active, razorpay_subscription_id')
      .eq('id', user.id)
      .single()

    if (profileError) throw profileError
    if (profile?.nest_active) {
      return json({ error: 'Nest is already active. Use Manage Nest instead.' }, 400)
    }

    // Hosted pay page works like Dashboard "Create subscription": do NOT pass
    // customer_id. Razorpay attaches customer after authorisation payment.
    // Pre-attaching a customer (API) was causing "Hosted page is not available".
    const subscriptionPayload: Record<string, unknown> = {
      plan_id: planId,
      total_count: totalCount,
      quantity: 1,
      customer_notify: true,
      expire_by: expireBy,
      notes: {
        supabase_user_id: user.id,
        nest_plan: plan,
      },
    }

    if (user.email) {
      subscriptionPayload.notify_info = {
        notify_email: user.email,
      }
    }

    const subscription = await razorpayFetch('/subscriptions', {
      method: 'POST',
      body: JSON.stringify(subscriptionPayload),
    })

    const { error: subUpdateError } = await admin
      .from('profiles')
      .update({
        razorpay_subscription_id: subscription.id,
        nest_price_id: planId,
        nest_status: subscription.status ?? 'created',
      })
      .eq('id', user.id)
    if (subUpdateError) throw subUpdateError

    const checkoutUrl = subscription.short_url
    if (!checkoutUrl) return json({ error: 'Checkout URL missing' }, 500)

    return json({
      success: true,
      url: checkoutUrl,
      subscriptionId: subscription.id,
    })
  } catch (error) {
    console.error(error)
    return json({ error: error instanceof Error ? error.message : 'Checkout failed' }, 400)
  }
})
