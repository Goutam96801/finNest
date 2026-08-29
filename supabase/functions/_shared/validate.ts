export function assertPositiveAmount(amount: unknown): number {
  const n = typeof amount === 'number' ? amount : Number(amount)
  if (!Number.isFinite(n) || n <= 0) throw new Error('Amount must be a positive number')
  return n
}

export const ALLOWED_ACCOUNT_TYPES = [
  'bank',
  'cash',
  'wallet',
  'credit_card',
  'investment',
  'loan',
  'other',
] as const
