# Review package Task 4
BASE: 63f6c4eb1646c7e7f5dd18d249df15b6cdf5a0c5
HEAD: c1336b9fe74bb82a9092d9bb92bd14c414440850

## Commits
c1336b9 feat: add Fynn read tools and catalog


## Stat
 supabase/functions/_shared/tools/catalog.ts  |  69 +++++++++++
 supabase/functions/_shared/tools/executor.ts |  54 +++++++++
 supabase/functions/_shared/tools/reads.ts    | 168 +++++++++++++++++++++++++++
 supabase/functions/_shared/validate.ts       |  15 +++
 4 files changed, 306 insertions(+)


## Diff
```diff
diff --git a/supabase/functions/_shared/tools/catalog.ts b/supabase/functions/_shared/tools/catalog.ts
new file mode 100644
index 0000000..a1bed5a
--- /dev/null
+++ b/supabase/functions/_shared/tools/catalog.ts
@@ -0,0 +1,69 @@
+import type { ToolDef } from '../llm/types.ts'
+
+const limitParameter = {
+  type: 'integer',
+  minimum: 1,
+  maximum: 25,
+  description: 'Maximum number of records to return.',
+}
+
+export const TOOL_DEFS: ToolDef[] = [
+  {
+    name: 'list_accounts',
+    description: 'List the userÔÇÖs active financial accounts and balances.',
+    parameters: {
+      type: 'object',
+      properties: { limit: limitParameter },
+      additionalProperties: false,
+    },
+  },
+  {
+    name: 'list_transactions',
+    description: 'List the userÔÇÖs transactions, optionally filtered by type, account, date range, or text.',
+    parameters: {
+      type: 'object',
+      properties: {
+        limit: limitParameter,
+        type: { type: 'string', enum: ['expense', 'income', 'transfer'] },
+        accountId: { type: 'string', description: 'Account UUID to match on either side of a transfer.' },
+        from: { type: 'string', format: 'date-time', description: 'Inclusive transaction date.' },
+        to: { type: 'string', format: 'date-time', description: 'Inclusive transaction date.' },
+        search: { type: 'string', maxLength: 100, description: 'Text in a transaction description or category.' },
+      },
+      additionalProperties: false,
+    },
+  },
+  {
+    name: 'get_transaction',
+    description: 'Get one transaction by ID.',
+    parameters: {
+      type: 'object',
+      properties: { transactionId: { type: 'string', description: 'Transaction UUID.' } },
+      required: ['transactionId'],
+      additionalProperties: false,
+    },
+  },
+  {
+    name: 'list_subscriptions',
+    description: 'List the userÔÇÖs active recurring subscriptions, ordered by next due date.',
+    parameters: {
+      type: 'object',
+      properties: { limit: limitParameter },
+      additionalProperties: false,
+    },
+  },
+  {
+    name: 'get_profile',
+    description: 'Get the userÔÇÖs profile preferences.',
+    parameters: { type: 'object', properties: {}, additionalProperties: false },
+  },
+  {
+    name: 'list_notifications',
+    description: 'List the userÔÇÖs most recent notifications.',
+    parameters: {
+      type: 'object',
+      properties: { limit: limitParameter },
+      additionalProperties: false,
+    },
+  },
+]
diff --git a/supabase/functions/_shared/tools/executor.ts b/supabase/functions/_shared/tools/executor.ts
new file mode 100644
index 0000000..d5d9c7c
--- /dev/null
+++ b/supabase/functions/_shared/tools/executor.ts
@@ -0,0 +1,54 @@
+import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
+import {
+  getProfile,
+  getTransaction,
+  listAccounts,
+  listNotifications,
+  listSubscriptions,
+  listTransactions,
+} from './reads.ts'
+
+type ExecuteToolInput = {
+  name: string
+  args: Record<string, unknown>
+  userId: string
+  userClient: SupabaseClient
+}
+
+export async function executeTool(
+  input: ExecuteToolInput
+): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
+  try {
+    let result: unknown
+
+    switch (input.name) {
+      case 'list_accounts':
+        result = await listAccounts(input)
+        break
+      case 'list_transactions':
+        result = await listTransactions(input)
+        break
+      case 'get_transaction':
+        result = await getTransaction(input)
+        break
+      case 'list_subscriptions':
+        result = await listSubscriptions(input)
+        break
+      case 'get_profile':
+        result = await getProfile(input)
+        break
+      case 'list_notifications':
+        result = await listNotifications(input)
+        break
+      default:
+        return { ok: false, error: 'Unknown tool' }
+    }
+
+    return { ok: true, result }
+  } catch (error) {
+    return {
+      ok: false,
+      error: error instanceof Error ? error.message : 'Tool execution failed',
+    }
+  }
+}
diff --git a/supabase/functions/_shared/tools/reads.ts b/supabase/functions/_shared/tools/reads.ts
new file mode 100644
index 0000000..a6a8ea2
--- /dev/null
+++ b/supabase/functions/_shared/tools/reads.ts
@@ -0,0 +1,168 @@
+import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
+
+type ToolContext = {
+  args: Record<string, unknown>
+  userId: string
+  userClient: SupabaseClient
+}
+
+type Row = Record<string, unknown>
+
+const MAX_LIST_ROWS = 25
+
+function getLimit(value: unknown): number {
+  const parsed = typeof value === 'number' ? value : Number(value)
+  if (!Number.isFinite(parsed)) return 20
+  return Math.min(MAX_LIST_ROWS, Math.max(1, Math.floor(parsed)))
+}
+
+function getString(value: unknown): string | undefined {
+  return typeof value === 'string' && value.trim() ? value.trim() : undefined
+}
+
+function compactAccount(row: Row) {
+  return {
+    id: row.id,
+    name: row.name,
+    type: row.type,
+    balance: Number(row.balance ?? 0),
+    bank_name: row.bank_name,
+    is_primary: row.is_primary,
+  }
+}
+
+function compactTransaction(row: Row) {
+  return {
+    id: row.id,
+    account_id: row.account_id,
+    to_account_id: row.to_account_id,
+    type: row.type,
+    category: row.category,
+    amount: Number(row.amount ?? 0),
+    description: row.description,
+    status: row.status,
+    transaction_date: row.transaction_date,
+  }
+}
+
+export async function listAccounts({ args, userId, userClient }: ToolContext) {
+  const { data, error } = await userClient
+    .from('accounts')
+    .select('id, name, type, balance, bank_name, is_primary')
+    .eq('user_id', userId)
+    .eq('is_archived', false)
+    .order('is_primary', { ascending: false })
+    .order('display_order', { ascending: true })
+    .limit(getLimit(args.limit))
+
+  if (error) throw error
+  return (data as Row[] | null ?? []).map(compactAccount)
+}
+
+export async function listTransactions({ args, userId, userClient }: ToolContext) {
+  let query = userClient
+    .from('transactions')
+    .select(
+      'id, account_id, to_account_id, type, category, amount, description, status, transaction_date'
+    )
+    .eq('user_id', userId)
+    .order('transaction_date', { ascending: false })
+    .order('created_at', { ascending: false })
+    .limit(getLimit(args.limit))
+
+  const type = getString(args.type)
+  if (type && ['expense', 'income', 'transfer'].includes(type)) query = query.eq('type', type)
+
+  const accountId = getString(args.accountId)
+  if (accountId) query = query.or(`account_id.eq.${accountId},to_account_id.eq.${accountId}`)
+
+  const from = getString(args.from)
+  if (from) query = query.gte('transaction_date', from)
+
+  const to = getString(args.to)
+  if (to) query = query.lte('transaction_date', to)
+
+  const search = getString(args.search)?.replace(/[^a-zA-Z0-9\s-]/g, '').slice(0, 100)
+  if (search) query = query.or(`description.ilike.%${search}%,category.ilike.%${search}%`)
+
+  const { data, error } = await query
+  if (error) throw error
+  return (data as Row[] | null ?? []).map(compactTransaction)
+}
+
+export async function getTransaction({ args, userId, userClient }: ToolContext) {
+  const transactionId = getString(args.transactionId)
+  if (!transactionId) throw new Error('transactionId is required')
+
+  const { data, error } = await userClient
+    .from('transactions')
+    .select(
+      'id, account_id, to_account_id, type, category, amount, description, status, transaction_date'
+    )
+    .eq('id', transactionId)
+    .eq('user_id', userId)
+    .maybeSingle()
+
+  if (error) throw error
+  return data ? compactTransaction(data as Row) : null
+}
+
+export async function listSubscriptions({ args, userId, userClient }: ToolContext) {
+  const { data, error } = await userClient
+    .from('subscriptions')
+    .select('id, account_id, name, amount, category, frequency, next_due_date, is_active')
+    .eq('user_id', userId)
+    .eq('is_active', true)
+    .order('next_due_date', { ascending: true })
+    .limit(getLimit(args.limit))
+
+  if (error) throw error
+  return (data as Row[] | null ?? []).map((row) => ({
+    id: row.id,
+    account_id: row.account_id,
+    name: row.name,
+    amount: Number(row.amount ?? 0),
+    category: row.category,
+    frequency: row.frequency,
+    next_due_date: row.next_due_date,
+    is_active: row.is_active,
+  }))
+}
+
+export async function getProfile({ userId, userClient }: ToolContext) {
+  const { data, error } = await userClient
+    .from('profiles')
+    .select('full_name, avatar_url, currency, timezone')
+    .eq('id', userId)
+    .maybeSingle()
+
+  if (error) throw error
+  if (!data) return null
+
+  const row = data as Row
+  return {
+    full_name: row.full_name,
+    avatar_url: row.avatar_url,
+    currency: row.currency,
+    timezone: row.timezone,
+  }
+}
+
+export async function listNotifications({ args, userId, userClient }: ToolContext) {
+  const { data, error } = await userClient
+    .from('notifications')
+    .select('id, type, title, body, is_read, created_at')
+    .eq('user_id', userId)
+    .order('created_at', { ascending: false })
+    .limit(getLimit(args.limit))
+
+  if (error) throw error
+  return (data as Row[] | null ?? []).map((row) => ({
+    id: row.id,
+    type: row.type,
+    title: row.title,
+    body: row.body,
+    is_read: row.is_read,
+    created_at: row.created_at,
+  }))
+}
diff --git a/supabase/functions/_shared/validate.ts b/supabase/functions/_shared/validate.ts
new file mode 100644
index 0000000..4b1e621
--- /dev/null
+++ b/supabase/functions/_shared/validate.ts
@@ -0,0 +1,15 @@
+export function assertPositiveAmount(amount: unknown): number {
+  const n = typeof amount === 'number' ? amount : Number(amount)
+  if (!Number.isFinite(n) || n <= 0) throw new Error('Amount must be a positive number')
+  return n
+}
+
+export const ALLOWED_ACCOUNT_TYPES = [
+  'bank',
+  'cash',
+  'wallet',
+  'credit_card',
+  'investment',
+  'loan',
+  'other',
+] as const

```
