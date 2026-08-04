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

/**
 * Manage Nest for Razorpay:
 * - action=cancel → cancel at cycle end (default)
 * - action=resume → clear cancel_at_cycle_end if still active
 * Razorpay has no Stripe-style hosted portal; manage is API-driven.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization' }, 401)

    if (!razorpayAuthHeader()) return json({ error: 'Razorpay is not configured' }, 500)

    const body = await req.json().catch(() => ({}))
    const action = body?.action === 'resume' ? 'resume' : 'cancel'

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
      .select('razorpay_subscription_id, nest_active, nest_renews_at')
      .eq('id', user.id)
      .single()

    if (profileError) throw profileError
    if (!profile?.razorpay_subscription_id) {
      return json({ error: 'No Nest subscription found.' }, 400)
    }

    const subId = profile.razorpay_subscription_id as string

    if (action === 'cancel') {
      const updated = await razorpayFetch(`/subscriptions/${subId}`, {
        method: 'PATCH',
        body: JSON.stringify({ cancel_at_cycle_end: true }),
      })
      await admin
        .from('profiles')
        .update({
          nest_status: updated.status ?? 'active',
          nest_renews_at: updated.current_end
            ? new Date(updated.current_end * 1000).toISOString()
            : profile.nest_renews_at,
        })
        .eq('id', user.id)

      return json({
        success: true,
        message: 'Nest will cancel at the end of the current period.',
        status: updated.status,
      })
    }

    const updated = await razorpayFetch(`/subscriptions/${subId}`, {
      method: 'PATCH',
      body: JSON.stringify({ cancel_at_cycle_end: false }),
    })
    await admin
      .from('profiles')
      .update({ nest_status: updated.status ?? 'active' })
      .eq('id', user.id)

    return json({
      success: true,
      message: 'Nest cancellation removed. Subscription continues.',
      status: updated.status,
    })
  } catch (error) {
    console.error(error)
    return json({ error: error instanceof Error ? error.message : 'Manage failed' }, 400)
  }
})
