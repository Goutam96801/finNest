import { getServiceClient } from '../_shared/auth.ts'
import { corsHeaders, json } from '../_shared/cors.ts'
import { verifyRazorpayWebhookSignature } from '../_shared/razorpay.ts'

type RazorpayEntity = {
  id?: string
  order_id?: string
  status?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const secret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET')
  if (!secret) return json({ error: 'Webhook not configured' }, 500)

  const rawBody = await req.text()
  const signature = req.headers.get('x-razorpay-signature')
  const valid = await verifyRazorpayWebhookSignature(rawBody, signature, secret)
  if (!valid) return json({ error: 'Invalid signature' }, 400)

  let event: { event?: string; payload?: Record<string, { entity?: RazorpayEntity }> }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const admin = getServiceClient()
  const name = event.event ?? ''

  try {
    if (name === 'payment.captured' || name === 'order.paid') {
      const payment = event.payload?.payment?.entity
      const order = event.payload?.order?.entity
      const orderId = payment?.order_id || order?.id
      const paymentId = payment?.id
      if (!orderId || !paymentId) return json({ ok: true, skipped: true })

      const { data, error } = await admin.rpc('activate_fynn_purchase', {
        p_order_id: orderId,
        p_payment_id: paymentId,
      })
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true, result: data })
    }

    if (name === 'payment.failed') {
      const payment = event.payload?.payment?.entity
      const orderId = payment?.order_id
      if (!orderId) return json({ ok: true, skipped: true })

      await admin
        .from('fynn_purchases')
        .update({ status: 'failed' })
        .eq('razorpay_order_id', orderId)
        .eq('status', 'created')

      return json({ ok: true })
    }

    return json({ ok: true, ignored: name })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Webhook failed' }, 500)
  }
})
