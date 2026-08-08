# Review package Task 7 re-review
BASE: 9bac132c37caaf6abea37507032ee5514332af1a
HEAD: 94065ec4bbe21ac873155d09289ffce47abf6fe4

## Commits
94065ec fix: mirror profile metadata and subscription side effects in Fynn
5a1e049 feat: extend Fynn propose/apply tools to all user entities


## Stat
 .superpowers/sdd/reports/task-7-report.md      |  37 ++++
 app/(tabs)/fynn.tsx                            |  10 ++
 supabase/functions/_shared/tools/apply.test.ts | 237 +++++++++++++++++++++++++
 supabase/functions/_shared/tools/apply.ts      | 226 ++++++++++++++++++++++-
 supabase/functions/_shared/tools/catalog.ts    | 126 +++++++++++++
 supabase/functions/_shared/tools/executor.ts   |  32 ++++
 supabase/functions/_shared/tools/proposals.ts  | 237 +++++++++++++++++++++++++
 7 files changed, 904 insertions(+), 1 deletion(-)


## Diff
```diff
diff --git a/.superpowers/sdd/reports/task-7-report.md b/.superpowers/sdd/reports/task-7-report.md
new file mode 100644
index 0000000..e6886dc
--- /dev/null
+++ b/.superpowers/sdd/reports/task-7-report.md
@@ -0,0 +1,37 @@
+# Task 7 Report: Remaining Fynn entity proposals
+
+## Status
+
+DONE_WITH_CONCERNS
+
+## Delivered
+
+- Added Fynn catalog and executor support for account, subscription, profile, and notification proposal tools.
+- Proposal handlers validate owned account/subscription/notification records, persist only pending `fynn_proposals` rows, and use snake_case payloads.
+- Apply handlers use the authenticated user client and scope every mutation to its authenticated user. Payload `user_id` values are ignored.
+- Account deletion follows the app's existing soft-archive behavior and maintains a primary account when a replacement exists. Profile updates accept only the approved safe fields.
+- Added focused Deno coverage proving an account proposal stores a snake_case payload consumed by apply.
+
+## Verification
+
+- `npx deno test supabase/functions/fynn-chat/index.test.ts supabase/functions/fynn-confirm/index.test.ts supabase/functions/_shared/tools/apply.test.ts` ÔÇö 9 passed.
+- `npx tsc --noEmit --pretty false` ÔÇö passed.
+- `npx expo lint` ÔÇö passed with 23 pre-existing warnings and no errors.
+- `git diff --check` ÔÇö passed.
+
+## Concerns
+
+- RLS ownership was enforced in code and existing policies were inspected, but live-database smoke tests for each entity group (including a forged UUID) were not run because no local Supabase database was available in this workspace.
+- The added automated mapping coverage focuses on accounts; the remaining entity handlers share the same authenticated-client and ownership-filter pattern but have not yet received per-entity integration tests.
+
+## Fix
+
+- `propose_update_profile` now mirrors an accepted `full_name` change to authenticated-user `display_name` metadata.
+- Subscription creates now insert the same `subscription_due` reminder-set notification as the client service. Subscription creates and updates return `reminderResyncRequired: true`; Fynn forwards this apply result and the mobile UI dynamically invokes `resyncSubscriptionRemindersForUser` after an accepted apply.
+- Added focused Deno regression coverage for profile metadata mirroring and subscription notification/resync output.
+
+## Fix Verification
+
+- `npx deno test supabase/functions/_shared/tools/apply.test.ts supabase/functions/fynn-confirm/index.test.ts` ÔÇö 8 passed.
+- `npx tsc --noEmit --pretty false` ÔÇö passed.
+- `npx expo lint` ÔÇö passed with 23 pre-existing warnings and no errors.
diff --git a/app/(tabs)/fynn.tsx b/app/(tabs)/fynn.tsx
index 437ee83..db49402 100644
--- a/app/(tabs)/fynn.tsx
+++ b/app/(tabs)/fynn.tsx
@@ -157,6 +157,16 @@ export default function Fynn() {
       if (!response.success) return
 
       const status: 'accepted' | 'rejected' = action === 'accept' ? 'accepted' : 'rejected'
+      if (
+        action === 'accept'
+        && typeof response.data === 'object'
+        && response.data !== null
+        && (response.data as { reminderResyncRequired?: unknown }).reminderResyncRequired === true
+      ) {
+        const { resyncSubscriptionRemindersForUser } = await import('@/lib/services/localReminders')
+        const { data: { user } } = await (await import('@/lib/supabase')).supabase.auth.getUser()
+        if (user) await resyncSubscriptionRemindersForUser(user.id)
+      }
       setChats((current) => current.map((chat) => (
         chat.id === chatId
           ? {
diff --git a/supabase/functions/_shared/tools/apply.test.ts b/supabase/functions/_shared/tools/apply.test.ts
index 0b29903..d36dc05 100644
--- a/supabase/functions/_shared/tools/apply.test.ts
+++ b/supabase/functions/_shared/tools/apply.test.ts
@@ -1,5 +1,6 @@
 import { assertEquals } from 'jsr:@std/assert'
 import { applyProposal } from './apply.ts'
+import { proposeCreateAccount } from './proposals.ts'
 
 Deno.test('applyProposal creates a transaction from snake_case proposal payload', async () => {
   const inserts: Array<Record<string, unknown>> = []
@@ -56,3 +57,239 @@ Deno.test('applyProposal creates a transaction from snake_case proposal payload'
     transaction_date: '2026-08-08T00:00:00.000Z',
   }])
 })
+
+Deno.test('applyProposal creates an account from a snake_case proposal payload', async () => {
+  const inserts: Array<Record<string, unknown>> = []
+  const activeAccountQuery = { eq: () => activeAccountQuery }
+  const userClient = {
+    from: (table: string) => {
+      if (table !== 'accounts') throw new Error(`Unexpected table: ${table}`)
+      return {
+        select: () => activeAccountQuery,
+        insert: (row: Record<string, unknown>) => {
+          inserts.push(row)
+          return {
+            select: () => ({
+              single: async () => ({ data: row, error: null }),
+            }),
+          }
+        },
+      }
+    },
+  }
+
+  await applyProposal(userClient as never, 'user-1', {
+    tool_name: 'propose_create_account',
+    payload: {
+      account: {
+        name: 'Travel fund',
+        type: 'bank',
+        balance: 1200,
+        color: '#3B82F6',
+        icon: 'Wallet',
+        account_number_last4: '1234',
+        bank_name: 'Example Bank',
+        credit_limit: null,
+        is_primary: false,
+        notes: 'For trips',
+      },
+    },
+  })
+
+  assertEquals(inserts, [{
+    user_id: 'user-1',
+    name: 'Travel fund',
+    type: 'bank',
+    balance: 1200,
+    color: '#3B82F6',
+    icon: 'Wallet',
+    account_number_last4: '1234',
+    bank_name: 'Example Bank',
+    credit_limit: null,
+    is_primary: true,
+    is_archived: false,
+    display_order: 0,
+    notes: 'For trips',
+  }])
+})
+
+Deno.test('account proposal stores snake_case payload that apply uses unchanged', async () => {
+  let storedProposal: Record<string, unknown> | undefined
+  const proposalClient = {
+    from: (table: string) => {
+      if (table !== 'fynn_proposals') throw new Error(`Unexpected table: ${table}`)
+      return {
+        insert: (row: Record<string, unknown>) => {
+          storedProposal = row
+          return {
+            select: () => ({
+              single: async () => ({ data: { id: 'proposal-1' }, error: null }),
+            }),
+          }
+        },
+      }
+    },
+  }
+  const proposal = await proposeCreateAccount({
+    args: { name: 'Emergency', type: 'cash', balance: 150 },
+    userId: 'user-1',
+    userClient: proposalClient as never,
+  })
+
+  const inserts: Array<Record<string, unknown>> = []
+  const activeAccountQuery = { eq: () => activeAccountQuery }
+  const applyClient = {
+    from: (table: string) => {
+      if (table !== 'accounts') throw new Error(`Unexpected table: ${table}`)
+      return {
+        select: () => activeAccountQuery,
+        insert: (row: Record<string, unknown>) => {
+          inserts.push(row)
+          return {
+            select: () => ({
+              single: async () => ({ data: row, error: null }),
+            }),
+          }
+        },
+      }
+    },
+  }
+  await applyProposal(applyClient as never, 'user-1', {
+    tool_name: 'propose_create_account',
+    payload: storedProposal?.payload as Record<string, unknown>,
+  })
+
+  assertEquals(storedProposal?.user_id, 'user-1')
+  assertEquals(storedProposal?.tool_name, 'propose_create_account')
+  assertEquals(proposal.proposal_id, 'proposal-1')
+  assertEquals(inserts[0], {
+    user_id: 'user-1',
+    name: 'Emergency',
+    type: 'cash',
+    balance: 150,
+    color: '#3B82F6',
+    icon: 'Wallet',
+    account_number_last4: null,
+    bank_name: null,
+    credit_limit: null,
+    is_primary: true,
+    is_archived: false,
+    display_order: 0,
+    notes: null,
+  })
+})
+
+Deno.test('applyProposal mirrors a changed full name to auth display metadata', async () => {
+  let profileUpdate: Record<string, unknown> | undefined
+  let authUpdate: Record<string, unknown> | undefined
+  const userClient = {
+    from: (table: string) => {
+      if (table !== 'profiles') throw new Error(`Unexpected table: ${table}`)
+      return {
+        update: (row: Record<string, unknown>) => {
+          profileUpdate = row
+          return {
+            eq: () => ({
+              select: () => ({
+                single: async () => ({ data: row, error: null }),
+              }),
+            }),
+          }
+        },
+      }
+    },
+    auth: {
+      updateUser: async (input: Record<string, unknown>) => {
+        authUpdate = input
+        return { error: null }
+      },
+    },
+  }
+
+  await applyProposal(userClient as never, 'user-1', {
+    tool_name: 'propose_update_profile',
+    payload: { profile: { full_name: 'Ada Lovelace' } },
+  })
+
+  assertEquals(profileUpdate, { full_name: 'Ada Lovelace' })
+  assertEquals(authUpdate, { data: { display_name: 'Ada Lovelace' } })
+})
+
+Deno.test('applyProposal creates a subscription notification and requests reminder resync', async () => {
+  const inserts: Array<{ table: string; row: Record<string, unknown> }> = []
+  const accountQuery = {
+    eq: () => accountQuery,
+    maybeSingle: async () => ({ data: { id: 'account-1' }, error: null }),
+  }
+  const userClient = {
+    from: (table: string) => {
+      if (table === 'accounts') return { select: () => accountQuery }
+      if (table === 'subscriptions') {
+        return {
+          insert: (row: Record<string, unknown>) => {
+            inserts.push({ table, row })
+            return {
+              select: () => ({
+                single: async () => ({ data: { id: 'subscription-1', ...row }, error: null }),
+              }),
+            }
+          },
+        }
+      }
+      if (table === 'notifications') {
+        return {
+          insert: (row: Record<string, unknown>) => {
+            inserts.push({ table, row })
+            return {
+              select: () => ({
+                single: async () => ({ data: row, error: null }),
+              }),
+            }
+          },
+        }
+      }
+      throw new Error(`Unexpected table: ${table}`)
+    },
+  }
+
+  const result = await applyProposal(userClient as never, 'user-1', {
+    tool_name: 'propose_create_subscription',
+    payload: {
+      subscription: {
+        account_id: 'account-1',
+        name: 'Netflix',
+        amount: 199,
+        category: 'entertainment',
+        frequency: 'monthly',
+        next_due_date: '2026-09-01',
+        notes: null,
+      },
+    },
+  })
+
+  assertEquals(result, {
+    data: {
+      id: 'subscription-1',
+      user_id: 'user-1',
+      account_id: 'account-1',
+      name: 'Netflix',
+      amount: 199,
+      category: 'entertainment',
+      frequency: 'monthly',
+      next_due_date: '2026-09-01',
+      notes: null,
+      is_active: true,
+    },
+    reminderResyncRequired: true,
+  })
+  assertEquals(inserts[1], {
+    table: 'notifications',
+    row: {
+      user_id: 'user-1',
+      type: 'subscription_due',
+      title: 'Netflix reminder set',
+      body: 'Due on 2026-09-01',
+      data: { subscriptionId: 'subscription-1' },
+    },
+  })
+})
diff --git a/supabase/functions/_shared/tools/apply.ts b/supabase/functions/_shared/tools/apply.ts
index f1584e9..d97c6e0 100644
--- a/supabase/functions/_shared/tools/apply.ts
+++ b/supabase/functions/_shared/tools/apply.ts
@@ -1,5 +1,13 @@
 import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
-import { buildTransactionPayload, type TransactionPayload } from './proposals.ts'
+import {
+  buildAccountPayload,
+  buildProfilePayload,
+  buildSubscriptionPayload,
+  buildTransactionPayload,
+  type AccountPayload,
+  type SubscriptionPayload,
+  type TransactionPayload,
+} from './proposals.ts'
 
 type Proposal = {
   tool_name: string
@@ -36,6 +44,17 @@ function getTransactionId(payload: Record<string, unknown>): string {
   return payload.transaction_id
 }
 
+function getPayloadObject(payload: Record<string, unknown>, key: string): Record<string, unknown> {
+  if (!isRecord(payload[key])) throw new Error('Invalid proposal payload')
+  return payload[key]
+}
+
+function getPayloadId(payload: Record<string, unknown>, key: string): string {
+  const value = payload[key]
+  if (typeof value !== 'string' || !value.trim()) throw new Error('Invalid proposal payload')
+  return value
+}
+
 async function getExistingTransaction(
   userClient: SupabaseClient,
   userId: string,
@@ -102,7 +121,212 @@ export async function applyProposal(
       if (error) throw error
       return { id: transactionId }
     }
+    case 'propose_create_account': {
+      const account = buildAccountPayload(getPayloadObject(proposal.payload, 'account'))
+      const activeAccountCount = await getActiveAccountCount(userClient, userId)
+      const isPrimary = activeAccountCount === 0 || account.is_primary
+      if (isPrimary && activeAccountCount > 0) await clearOtherPrimaryAccounts(userClient, userId)
+      const { data, error } = await userClient
+        .from('accounts')
+        .insert({ user_id: userId, ...account, is_primary: isPrimary, is_archived: false, display_order: 0 })
+        .select()
+        .single()
+      if (error) throw error
+      return data
+    }
+    case 'propose_update_account': {
+      const accountId = getPayloadId(proposal.payload, 'account_id')
+      const existing = await getExistingAccount(userClient, userId, accountId)
+      const account = buildAccountPayload(getPayloadObject(proposal.payload, 'account'), existing)
+      const isPrimary = (await getActiveAccountCount(userClient, userId)) <= 1 || account.is_primary
+      if (isPrimary) await clearOtherPrimaryAccounts(userClient, userId, accountId)
+      const { balance: _ignoredBalance, ...update } = account
+      const { data, error } = await userClient
+        .from('accounts')
+        .update({ ...update, is_primary: isPrimary })
+        .eq('id', accountId)
+        .eq('user_id', userId)
+        .select()
+        .single()
+      if (error) throw error
+      return data
+    }
+    case 'propose_delete_account': {
+      const accountId = getPayloadId(proposal.payload, 'account_id')
+      const account = await getExistingAccount(userClient, userId, accountId)
+      if (account.is_archived) throw new Error('Account is already archived')
+      const { error } = await userClient
+        .from('accounts')
+        .update({ is_archived: true, is_primary: false })
+        .eq('id', accountId)
+        .eq('user_id', userId)
+      if (error) throw error
+      if (account.is_primary) {
+        const { data: replacement, error: replacementError } = await userClient
+          .from('accounts')
+          .select('id')
+          .eq('user_id', userId)
+          .eq('is_archived', false)
+          .order('display_order', { ascending: true })
+          .order('created_at', { ascending: true })
+          .limit(1)
+          .maybeSingle()
+        if (replacementError) throw replacementError
+        if (replacement?.id) {
+          const { error: primaryError } = await userClient
+            .from('accounts')
+            .update({ is_primary: true })
+            .eq('id', replacement.id)
+            .eq('user_id', userId)
+          if (primaryError) throw primaryError
+        }
+      }
+      return { id: accountId }
+    }
+    case 'propose_create_subscription': {
+      const subscription = await buildSubscriptionPayload(
+        userClient, userId, getPayloadObject(proposal.payload, 'subscription')
+      )
+      const { data, error } = await userClient
+        .from('subscriptions')
+        .insert({ user_id: userId, ...subscription, is_active: true })
+        .select()
+        .single()
+      if (error) throw error
+      const { error: notificationError } = await userClient
+        .from('notifications')
+        .insert({
+          user_id: userId,
+          type: 'subscription_due',
+          title: `${subscription.name} reminder set`,
+          body: `Due on ${subscription.next_due_date}`,
+          data: { subscriptionId: data.id },
+        })
+        .select()
+        .single()
+      if (notificationError) throw notificationError
+      return { data, reminderResyncRequired: true }
+    }
+    case 'propose_update_subscription': {
+      const subscriptionId = getPayloadId(proposal.payload, 'subscription_id')
+      const existing = await getExistingSubscription(userClient, userId, subscriptionId)
+      const subscription = await buildSubscriptionPayload(
+        userClient, userId, getPayloadObject(proposal.payload, 'subscription'), existing
+      )
+      const { data, error } = await userClient
+        .from('subscriptions')
+        .update(subscription)
+        .eq('id', subscriptionId)
+        .eq('user_id', userId)
+        .select()
+        .single()
+      if (error) throw error
+      return { data, reminderResyncRequired: true }
+    }
+    case 'propose_delete_subscription': {
+      const subscriptionId = getPayloadId(proposal.payload, 'subscription_id')
+      await getExistingSubscription(userClient, userId, subscriptionId)
+      const { error } = await userClient
+        .from('subscriptions')
+        .delete()
+        .eq('id', subscriptionId)
+        .eq('user_id', userId)
+      if (error) throw error
+      return { id: subscriptionId }
+    }
+    case 'propose_update_profile': {
+      const profile = buildProfilePayload(getPayloadObject(proposal.payload, 'profile'))
+      const { data, error } = await userClient
+        .from('profiles')
+        .update(profile)
+        .eq('id', userId)
+        .select()
+        .single()
+      if (error) throw error
+      if (typeof profile.full_name === 'string') {
+        const { error: authError } = await userClient.auth.updateUser({
+          data: { display_name: profile.full_name },
+        })
+        if (authError) throw authError
+      }
+      return data
+    }
+    case 'propose_mark_notification_read': {
+      if (proposal.payload.all === true) {
+        const { error } = await userClient
+          .from('notifications')
+          .update({ is_read: true })
+          .eq('user_id', userId)
+          .eq('is_read', false)
+        if (error) throw error
+        return { all: true }
+      }
+      const notificationId = getPayloadId(proposal.payload, 'notification_id')
+      const { data, error } = await userClient
+        .from('notifications')
+        .update({ is_read: true })
+        .eq('id', notificationId)
+        .eq('user_id', userId)
+        .select()
+        .single()
+      if (error) throw error
+      return data
+    }
     default:
       throw new Error('Unsupported proposal')
   }
 }
+
+async function getExistingAccount(
+  userClient: SupabaseClient,
+  userId: string,
+  accountId: string
+): Promise<AccountPayload & { is_archived: boolean }> {
+  const { data, error } = await userClient
+    .from('accounts')
+    .select('name, type, balance, color, icon, account_number_last4, bank_name, credit_limit, is_primary, notes, is_archived')
+    .eq('id', accountId)
+    .eq('user_id', userId)
+    .maybeSingle()
+  if (error) throw error
+  if (!data) throw new Error('Account not found')
+  return data as AccountPayload & { is_archived: boolean }
+}
+
+async function getExistingSubscription(
+  userClient: SupabaseClient,
+  userId: string,
+  subscriptionId: string
+): Promise<SubscriptionPayload> {
+  const { data, error } = await userClient
+    .from('subscriptions')
+    .select('account_id, name, amount, category, frequency, next_due_date, notes')
+    .eq('id', subscriptionId)
+    .eq('user_id', userId)
+    .maybeSingle()
+  if (error) throw error
+  if (!data) throw new Error('Subscription not found')
+  return data as SubscriptionPayload
+}
+
+async function getActiveAccountCount(userClient: SupabaseClient, userId: string) {
+  const { data, error } = await userClient
+    .from('accounts')
+    .select('id')
+    .eq('user_id', userId)
+    .eq('is_archived', false)
+  if (error) throw error
+  return data?.length ?? 0
+}
+
+async function clearOtherPrimaryAccounts(userClient: SupabaseClient, userId: string, exceptAccountId?: string) {
+  let query = userClient
+    .from('accounts')
+    .update({ is_primary: false })
+    .eq('user_id', userId)
+    .eq('is_archived', false)
+    .eq('is_primary', true)
+  if (exceptAccountId) query = query.neq('id', exceptAccountId)
+  const { error } = await query
+  if (error) throw error
+}
diff --git a/supabase/functions/_shared/tools/catalog.ts b/supabase/functions/_shared/tools/catalog.ts
index 6193aa2..1de646a 100644
--- a/supabase/functions/_shared/tools/catalog.ts
+++ b/supabase/functions/_shared/tools/catalog.ts
@@ -117,4 +117,130 @@ export const TOOL_DEFS: ToolDef[] = [
       additionalProperties: false,
     },
   },
+  {
+    name: 'propose_create_account',
+    description: 'Propose creating a financial account. This does not make a change until the user confirms it.',
+    parameters: {
+      type: 'object',
+      properties: {
+        name: { type: 'string', maxLength: 100 },
+        type: { type: 'string', enum: ['bank', 'cash', 'wallet', 'credit_card', 'investment', 'loan', 'other'] },
+        balance: { type: 'number' },
+        color: { type: 'string', maxLength: 32 },
+        icon: { type: 'string', maxLength: 100 },
+        accountNumberLast4: { type: 'string', pattern: '^[0-9]{4}$' },
+        bankName: { type: 'string', maxLength: 100 },
+        creditLimit: { type: 'number', minimum: 0 },
+        isPrimary: { type: 'boolean' },
+        notes: { type: 'string', maxLength: 500 },
+      },
+      additionalProperties: false,
+    },
+  },
+  {
+    name: 'propose_update_account',
+    description: 'Propose updating an account. Account balances are managed by transactions.',
+    parameters: {
+      type: 'object',
+      properties: {
+        accountId: { type: 'string', description: 'Account UUID.' },
+        name: { type: 'string', maxLength: 100 },
+        type: { type: 'string', enum: ['bank', 'cash', 'wallet', 'credit_card', 'investment', 'loan', 'other'] },
+        color: { type: 'string', maxLength: 32 },
+        icon: { type: 'string', maxLength: 100 },
+        accountNumberLast4: { type: 'string', pattern: '^[0-9]{4}$' },
+        bankName: { type: 'string', maxLength: 100 },
+        creditLimit: { type: 'number', minimum: 0 },
+        isPrimary: { type: 'boolean' },
+        notes: { type: 'string', maxLength: 500 },
+      },
+      required: ['accountId'],
+      additionalProperties: false,
+    },
+  },
+  {
+    name: 'propose_delete_account',
+    description: 'Propose archiving an account. This does not make a change until the user confirms it.',
+    parameters: {
+      type: 'object',
+      properties: { accountId: { type: 'string', description: 'Account UUID.' } },
+      required: ['accountId'],
+      additionalProperties: false,
+    },
+  },
+  {
+    name: 'propose_create_subscription',
+    description: 'Propose creating a recurring subscription. This does not make a change until the user confirms it.',
+    parameters: {
+      type: 'object',
+      properties: {
+        accountId: { type: 'string', description: 'Account UUID.' },
+        name: { type: 'string', maxLength: 100 },
+        amount: { type: 'number', exclusiveMinimum: 0 },
+        category: { type: 'string', maxLength: 100 },
+        frequency: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] },
+        nextDueDate: { type: 'string', format: 'date' },
+        notes: { type: 'string', maxLength: 500 },
+      },
+      required: ['accountId', 'name', 'amount', 'frequency', 'nextDueDate'],
+      additionalProperties: false,
+    },
+  },
+  {
+    name: 'propose_update_subscription',
+    description: 'Propose updating a recurring subscription. This does not make a change until the user confirms it.',
+    parameters: {
+      type: 'object',
+      properties: {
+        subscriptionId: { type: 'string', description: 'Subscription UUID.' },
+        accountId: { type: 'string', description: 'Account UUID.' },
+        name: { type: 'string', maxLength: 100 },
+        amount: { type: 'number', exclusiveMinimum: 0 },
+        category: { type: 'string', maxLength: 100 },
+        frequency: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] },
+        nextDueDate: { type: 'string', format: 'date' },
+        notes: { type: 'string', maxLength: 500 },
+      },
+      required: ['subscriptionId'],
+      additionalProperties: false,
+    },
+  },
+  {
+    name: 'propose_delete_subscription',
+    description: 'Propose deleting a recurring subscription. This does not make a change until the user confirms it.',
+    parameters: {
+      type: 'object',
+      properties: { subscriptionId: { type: 'string', description: 'Subscription UUID.' } },
+      required: ['subscriptionId'],
+      additionalProperties: false,
+    },
+  },
+  {
+    name: 'propose_update_profile',
+    description: 'Propose updating safe profile preferences. This does not make a change until the user confirms it.',
+    parameters: {
+      type: 'object',
+      properties: {
+        fullName: { type: 'string', maxLength: 100 },
+        currency: { type: 'string', maxLength: 10 },
+        timezone: { type: 'string', maxLength: 100 },
+        subscriptionRemindersEnabled: { type: 'boolean' },
+        lowBalanceAlertsEnabled: { type: 'boolean' },
+        lowBalanceThreshold: { type: 'number', minimum: 0 },
+      },
+      additionalProperties: false,
+    },
+  },
+  {
+    name: 'propose_mark_notification_read',
+    description: 'Propose marking one notification, or every notification, as read.',
+    parameters: {
+      type: 'object',
+      properties: {
+        notificationId: { type: 'string', description: 'Notification UUID. Omit to mark all as read.' },
+        all: { type: 'boolean', description: 'Set true to mark every unread notification as read.' },
+      },
+      additionalProperties: false,
+    },
+  },
 ]
diff --git a/supabase/functions/_shared/tools/executor.ts b/supabase/functions/_shared/tools/executor.ts
index 714e172..8909f4c 100644
--- a/supabase/functions/_shared/tools/executor.ts
+++ b/supabase/functions/_shared/tools/executor.ts
@@ -8,8 +8,16 @@ import {
   listTransactions,
 } from './reads.ts'
 import {
+  proposeCreateAccount,
+  proposeCreateSubscription,
   proposeCreateTransaction,
+  proposeDeleteAccount,
+  proposeDeleteSubscription,
   proposeDeleteTransaction,
+  proposeMarkNotificationRead,
+  proposeUpdateAccount,
+  proposeUpdateProfile,
+  proposeUpdateSubscription,
   proposeUpdateTransaction,
 } from './proposals.ts'
 
@@ -54,6 +62,30 @@ export async function executeTool(
       case 'propose_delete_transaction':
         result = await proposeDeleteTransaction(input)
         break
+      case 'propose_create_account':
+        result = await proposeCreateAccount(input)
+        break
+      case 'propose_update_account':
+        result = await proposeUpdateAccount(input)
+        break
+      case 'propose_delete_account':
+        result = await proposeDeleteAccount(input)
+        break
+      case 'propose_create_subscription':
+        result = await proposeCreateSubscription(input)
+        break
+      case 'propose_update_subscription':
+        result = await proposeUpdateSubscription(input)
+        break
+      case 'propose_delete_subscription':
+        result = await proposeDeleteSubscription(input)
+        break
+      case 'propose_update_profile':
+        result = await proposeUpdateProfile(input)
+        break
+      case 'propose_mark_notification_read':
+        result = await proposeMarkNotificationRead(input)
+        break
       default:
         return { ok: false, error: 'Unknown tool' }
     }
diff --git a/supabase/functions/_shared/tools/proposals.ts b/supabase/functions/_shared/tools/proposals.ts
index 4b30349..60f671f 100644
--- a/supabase/functions/_shared/tools/proposals.ts
+++ b/supabase/functions/_shared/tools/proposals.ts
@@ -194,3 +194,240 @@ export async function proposeDeleteTransaction(context: ToolContext) {
     transaction
   )
 }
+
+const accountTypes = ['bank', 'cash', 'wallet', 'credit_card', 'investment', 'loan', 'other'] as const
+const subscriptionFrequencies = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const
+
+function optionalBoolean(value: unknown): boolean | undefined {
+  return typeof value === 'boolean' ? value : undefined
+}
+
+function optionalNumber(value: unknown): number | undefined {
+  if (value === null || value === undefined || value === '') return undefined
+  const number = typeof value === 'number' ? value : Number(value)
+  return Number.isFinite(number) ? number : undefined
+}
+
+function optionalArg(args: Record<string, unknown>, camel: string, snake: string): unknown {
+  return args[camel] ?? args[snake]
+}
+
+async function getOwnedRow(
+  userClient: SupabaseClient,
+  userId: string,
+  table: 'accounts' | 'subscriptions' | 'notifications',
+  id: string,
+  columns = '*'
+): Promise<Record<string, unknown>> {
+  const { data, error } = await userClient
+    .from(table)
+    .select(columns)
+    .eq('id', id)
+    .eq('user_id', userId)
+    .maybeSingle()
+  if (error) throw error
+  if (!data) throw new Error(`${table.slice(0, -1)} not found`)
+  return data as unknown as Record<string, unknown>
+}
+
+export type AccountPayload = {
+  name: string
+  type: typeof accountTypes[number]
+  balance: number
+  color: string
+  icon: string
+  account_number_last4: string | null
+  bank_name: string | null
+  credit_limit: number | null
+  is_primary: boolean
+  notes: string | null
+}
+
+export function buildAccountPayload(args: Record<string, unknown>, existing?: AccountPayload): AccountPayload {
+  const name = optionalString(args.name) ?? existing?.name ?? 'New Account'
+  const type = optionalString(args.type) ?? existing?.type ?? 'bank'
+  const balance = optionalNumber(args.balance) ?? existing?.balance ?? 0
+  const color = optionalString(args.color) ?? existing?.color ?? '#3B82F6'
+  const icon = optionalString(args.icon) ?? existing?.icon ?? 'Wallet'
+  const last4 = optionalString(optionalArg(args, 'accountNumberLast4', 'account_number_last4'))
+    ?? existing?.account_number_last4 ?? null
+  const bankName = optionalString(optionalArg(args, 'bankName', 'bank_name'))
+    ?? existing?.bank_name ?? null
+  const creditLimitInput = optionalArg(args, 'creditLimit', 'credit_limit')
+  const creditLimit = creditLimitInput === undefined
+    ? existing?.credit_limit ?? null
+    : optionalNumber(creditLimitInput) ?? null
+  const isPrimary = optionalBoolean(optionalArg(args, 'isPrimary', 'is_primary'))
+    ?? existing?.is_primary ?? false
+  const notes = args.notes === undefined ? existing?.notes ?? null : optionalString(args.notes) ?? null
+
+  if (!accountTypes.includes(type as typeof accountTypes[number])) throw new Error('Invalid account type')
+  if (!Number.isFinite(balance) || balance <= -999999999) throw new Error('Invalid account balance')
+  if (last4 && !/^[0-9]{4}$/.test(last4)) throw new Error('Last 4 digits must be exactly 4 numbers')
+  if (creditLimit !== null && creditLimit < 0) throw new Error('Credit limit must not be negative')
+
+  return {
+    name,
+    type: type as AccountPayload['type'],
+    balance,
+    color,
+    icon,
+    account_number_last4: last4,
+    bank_name: bankName,
+    credit_limit: creditLimit,
+    is_primary: isPrimary,
+    notes,
+  }
+}
+
+export async function proposeCreateAccount(context: ToolContext) {
+  const account = buildAccountPayload(context.args)
+  return insertProposal(context.userClient, context.userId, 'propose_create_account', { account },
+    `Create the ${account.name} account.`, account)
+}
+
+export async function proposeUpdateAccount(context: ToolContext) {
+  const accountId = requiredString(context.args.accountId, 'accountId')
+  const existing = await getOwnedRow(context.userClient, context.userId, 'accounts', accountId)
+  const account = buildAccountPayload(context.args, existing as unknown as AccountPayload)
+  account.balance = Number(existing.balance)
+  return insertProposal(context.userClient, context.userId, 'propose_update_account',
+    { account_id: accountId, account }, `Update the ${account.name} account.`, { id: accountId, ...account })
+}
+
+export async function proposeDeleteAccount(context: ToolContext) {
+  const accountId = requiredString(context.args.accountId, 'accountId')
+  const account = await getOwnedRow(context.userClient, context.userId, 'accounts', accountId)
+  if (account.is_archived) throw new Error('Account is already archived')
+  return insertProposal(context.userClient, context.userId, 'propose_delete_account',
+    { account_id: accountId }, `Archive the ${account.name ?? 'account'} account.`, account)
+}
+
+export type SubscriptionPayload = {
+  account_id: string
+  name: string
+  amount: number
+  category: string
+  frequency: typeof subscriptionFrequencies[number]
+  next_due_date: string
+  notes: string | null
+}
+
+function requiredDate(value: unknown): string {
+  const date = requiredString(value, 'Next due date')
+  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00.000Z`).getTime())) {
+    throw new Error('Invalid next due date')
+  }
+  return date
+}
+
+export async function buildSubscriptionPayload(
+  userClient: SupabaseClient,
+  userId: string,
+  args: Record<string, unknown>,
+  existing?: SubscriptionPayload
+): Promise<SubscriptionPayload> {
+  const accountId = optionalString(optionalArg(args, 'accountId', 'account_id')) ?? existing?.account_id
+  const name = optionalString(args.name) ?? existing?.name
+  const amount = args.amount === undefined ? existing?.amount : requiredAmount(args.amount)
+  const category = optionalString(args.category) ?? existing?.category ?? 'others'
+  const frequency = optionalString(args.frequency) ?? existing?.frequency
+  const nextDueDate = args.nextDueDate === undefined && args.next_due_date === undefined
+    ? existing?.next_due_date
+    : requiredDate(optionalArg(args, 'nextDueDate', 'next_due_date'))
+  const notes = args.notes === undefined ? existing?.notes ?? null : optionalString(args.notes) ?? null
+
+  if (!accountId) throw new Error('Account is required')
+  if (!name) throw new Error('Name is required')
+  if (!amount || amount <= 0) throw new Error('Amount must be greater than 0')
+  if (!frequency || !subscriptionFrequencies.includes(frequency as typeof subscriptionFrequencies[number])) {
+    throw new Error('Invalid subscription frequency')
+  }
+  if (!nextDueDate) throw new Error('Next due date is required')
+  await assertAccountOwned(userClient, userId, accountId)
+  return {
+    account_id: accountId,
+    name,
+    amount,
+    category,
+    frequency: frequency as SubscriptionPayload['frequency'],
+    next_due_date: nextDueDate,
+    notes,
+  }
+}
+
+export async function proposeCreateSubscription(context: ToolContext) {
+  const subscription = await buildSubscriptionPayload(context.userClient, context.userId, context.args)
+  return insertProposal(context.userClient, context.userId, 'propose_create_subscription', { subscription },
+    `Create the ${subscription.name} subscription.`, subscription)
+}
+
+export async function proposeUpdateSubscription(context: ToolContext) {
+  const subscriptionId = requiredString(context.args.subscriptionId, 'subscriptionId')
+  const existing = await getOwnedRow(context.userClient, context.userId, 'subscriptions', subscriptionId)
+  const subscription = await buildSubscriptionPayload(
+    context.userClient, context.userId, context.args, existing as unknown as SubscriptionPayload
+  )
+  return insertProposal(context.userClient, context.userId, 'propose_update_subscription',
+    { subscription_id: subscriptionId, subscription }, `Update the ${subscription.name} subscription.`,
+    { id: subscriptionId, ...subscription })
+}
+
+export async function proposeDeleteSubscription(context: ToolContext) {
+  const subscriptionId = requiredString(context.args.subscriptionId, 'subscriptionId')
+  const subscription = await getOwnedRow(context.userClient, context.userId, 'subscriptions', subscriptionId)
+  return insertProposal(context.userClient, context.userId, 'propose_delete_subscription',
+    { subscription_id: subscriptionId }, `Delete the ${subscription.name ?? 'subscription'} subscription.`, subscription)
+}
+
+export function buildProfilePayload(args: Record<string, unknown>): Record<string, unknown> {
+  const profile: Record<string, unknown> = {}
+  const strings: Array<[string, string]> = [['fullName', 'full_name'], ['currency', 'currency'], ['timezone', 'timezone']]
+  for (const [camel, snake] of strings) {
+    const value = optionalArg(args, camel, snake)
+    if (value !== undefined) {
+      const parsed = optionalString(value)
+      if (!parsed) throw new Error(`${snake} must not be empty`)
+      profile[snake] = parsed
+    }
+  }
+  const booleans: Array<[string, string]> = [
+    ['subscriptionRemindersEnabled', 'subscription_reminders_enabled'],
+    ['lowBalanceAlertsEnabled', 'low_balance_alerts_enabled'],
+  ]
+  for (const [camel, snake] of booleans) {
+    const value = optionalArg(args, camel, snake)
+    if (value !== undefined) {
+      if (typeof value !== 'boolean') throw new Error(`${snake} must be boolean`)
+      profile[snake] = value
+    }
+  }
+  const threshold = optionalArg(args, 'lowBalanceThreshold', 'low_balance_threshold')
+  if (threshold !== undefined) {
+    const value = optionalNumber(threshold)
+    if (value === undefined || value < 0) throw new Error('low_balance_threshold must not be negative')
+    profile.low_balance_threshold = value
+  }
+  if (Object.keys(profile).length === 0) throw new Error('At least one safe profile field is required')
+  return profile
+}
+
+export async function proposeUpdateProfile(context: ToolContext) {
+  const profile = buildProfilePayload(context.args)
+  return insertProposal(context.userClient, context.userId, 'propose_update_profile', { profile },
+    'Update profile preferences.', profile)
+}
+
+export async function proposeMarkNotificationRead(context: ToolContext) {
+  const notificationId = optionalString(context.args.notificationId)
+  const markAll = context.args.all === true
+  if (!notificationId && !markAll) throw new Error('notificationId or all=true is required')
+  if (notificationId && markAll) throw new Error('Choose one notification or all notifications')
+  if (notificationId) {
+    const notification = await getOwnedRow(context.userClient, context.userId, 'notifications', notificationId)
+    return insertProposal(context.userClient, context.userId, 'propose_mark_notification_read',
+      { notification_id: notificationId }, 'Mark this notification as read.', notification)
+  }
+  return insertProposal(context.userClient, context.userId, 'propose_mark_notification_read',
+    { all: true }, 'Mark all notifications as read.', { all: true })
+}

```
