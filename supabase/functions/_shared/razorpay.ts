export const FYNN_PLANS = {
  monthly: { amountPaise: 9900, days: 30, label: 'Fynn Pro Monthly' },
  yearly: { amountPaise: 99900, days: 365, label: 'Fynn Pro Yearly' },
} as const

export type FynnPlan = keyof typeof FYNN_PLANS

export function isFynnPlan(value: unknown): value is FynnPlan {
  return value === 'monthly' || value === 'yearly'
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return hex(sig)
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

export async function verifyRazorpayWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!signature) return false
  const expected = await hmacSha256Hex(secret, rawBody)
  return timingSafeEqual(expected, signature)
}

export async function createRazorpayOrder(params: {
  keyId: string
  keySecret: string
  amountPaise: number
  receipt: string
  notes: Record<string, string>
}): Promise<{ id: string; amount: number; currency: string }> {
  const auth = btoa(`${params.keyId}:${params.keySecret}`)
  const resp = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: params.amountPaise,
      currency: 'INR',
      receipt: params.receipt,
      notes: params.notes,
    }),
  })
  const data = await resp.json().catch(() => ({})) as { id?: string; amount?: number; currency?: string; error?: { description?: string } }
  if (!resp.ok || !data.id) {
    throw new Error(data.error?.description || `Razorpay order failed (${resp.status})`)
  }
  return { id: data.id, amount: data.amount ?? params.amountPaise, currency: data.currency ?? 'INR' }
}
