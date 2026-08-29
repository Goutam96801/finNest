import { getAuthedUserClient, getServiceClient } from '../_shared/auth.ts'
import { corsHeaders, json } from '../_shared/cors.ts'
import { createRazorpayOrder, FYNN_PLANS, isFynnPlan } from '../_shared/razorpay.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const keyId = Deno.env.get('RAZORPAY_KEY_ID')
  const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET')
  if (!keyId || !keySecret) return json({ error: 'Payments are not configured' }, 500)

  let ctx: Awaited<ReturnType<typeof getAuthedUserClient>>
  try {
    ctx = await getAuthedUserClient(req)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unauthorized' }, 401)
  }
  const { user } = ctx

  const body = await req.json().catch(() => ({}))
  if (!isFynnPlan(body.plan)) return json({ error: 'plan must be monthly or yearly' }, 400)

  const plan = body.plan
  const spec = FYNN_PLANS[plan]
  const receipt = `fynn_${plan}_${Date.now().toString(36)}`.slice(0, 40)

  try {
    const order = await createRazorpayOrder({
      keyId,
      keySecret,
      amountPaise: spec.amountPaise,
      receipt,
      notes: { user_id: user.id, plan },
    })

    const admin = getServiceClient()
    const { error } = await admin.from('fynn_purchases').insert({
      user_id: user.id,
      plan,
      amount_paise: spec.amountPaise,
      currency: 'INR',
      status: 'created',
      razorpay_order_id: order.id,
    })
    if (error) return json({ error: error.message }, 500)

    return json({
      keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      plan,
      description: spec.label,
    })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Could not create order' }, 400)
  }
})
