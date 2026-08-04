import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-razorpay-signature',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function hmacSha256Hex(secret: string, body: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function isActiveStatus(status: string | undefined) {
  return status === 'active' || status === 'authenticated'
}

async function applySubscriptionPayload(
  admin: ReturnType<typeof createClient>,
  subscription: Record<string, any>
) {
  const notes = subscription.notes || {}
  let profileId: string | null =
    typeof notes.supabase_user_id === 'string' ? notes.supabase_user_id : null

  if (!profileId && subscription.customer_id) {
    const { data } = await admin
      .from('profiles')
      .select('id')
      .eq('razorpay_customer_id', subscription.customer_id)
      .maybeSingle()
    profileId = data?.id ?? null
  }

  if (!profileId && subscription.id) {
    const { data } = await admin
      .from('profiles')
      .select('id')
      .eq('razorpay_subscription_id', subscription.id)
      .maybeSingle()
    profileId = data?.id ?? null
  }

  if (!profileId) {
    console.error('No profile for Razorpay subscription', subscription.id)
    return
  }

  const status = String(subscription.status || '')
  const active = isActiveStatus(status)
  const renewsAt = subscription.current_end
    ? new Date(Number(subscription.current_end) * 1000).toISOString()
    : null

  const patch: Record<string, unknown> = {
    nest_active: active,
    nest_status: status || null,
    nest_price_id: subscription.plan_id ?? null,
    nest_renews_at: renewsAt,
    razorpay_subscription_id: subscription.id ?? null,
  }
  if (subscription.customer_id) {
    patch.razorpay_customer_id = subscription.customer_id
  }

  // Ended / halted / cancelled → revoke Nest
  if (['cancelled', 'completed', 'expired'].includes(status)) {
    patch.nest_active = false
  }

  const { error } = await admin.from('profiles').update(patch).eq('id', profileId)
  if (error) throw error
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const webhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET')
  if (!webhookSecret) return json({ error: 'Razorpay webhook not configured' }, 500)

  const signature = req.headers.get('x-razorpay-signature')
  if (!signature) return json({ error: 'Missing x-razorpay-signature' }, 400)

  const rawBody = await req.text()
  const expected = await hmacSha256Hex(webhookSecret, rawBody)
  if (expected !== signature) {
    return json({ error: 'Invalid signature' }, 400)
  }

  let event: { event?: string; payload?: Record<string, any> }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const type = event.event || ''
    const subscription =
      event.payload?.subscription?.entity ||
      event.payload?.subscription ||
      null

    if (
      type.startsWith('subscription.') &&
      subscription &&
      typeof subscription === 'object'
    ) {
      await applySubscriptionPayload(admin, subscription)
    }

    return json({ received: true })
  } catch (error) {
    console.error(error)
    return json({ error: error instanceof Error ? error.message : 'Webhook failed' }, 400)
  }
})
