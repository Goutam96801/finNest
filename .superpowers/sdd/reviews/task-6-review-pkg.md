# Review package Task 6 re-review
BASE: 8a04bd3074b0099ad5d9e70b86d910275e30aa60
HEAD: 9bac132c37caaf6abea37507032ee5514332af1a

## Commits
9bac132 fix: align Fynn apply payload keys and atomic confirm
6112b51 feat: add Fynn mutation proposals with confirm/reject


## Stat
 .superpowers/sdd/reports/task-6-report.md      |  36 +++++
 app/(tabs)/fynn.tsx                            | 100 ++++++++++++-
 lib/services/fynn.ts                           |  13 ++
 supabase/functions/_shared/tools/apply.test.ts |  58 ++++++++
 supabase/functions/_shared/tools/apply.ts      | 108 ++++++++++++++
 supabase/functions/_shared/tools/catalog.ts    |  51 +++++++
 supabase/functions/_shared/tools/executor.ts   |  14 ++
 supabase/functions/_shared/tools/proposals.ts  | 196 +++++++++++++++++++++++++
 supabase/functions/fynn-chat/index.test.ts     |  54 ++++++-
 supabase/functions/fynn-chat/index.ts          |  27 ++++
 supabase/functions/fynn-confirm/index.test.ts  | 106 +++++++++++++
 supabase/functions/fynn-confirm/index.ts       | 155 +++++++++++++++++++
 12 files changed, 911 insertions(+), 7 deletions(-)


## Diff
```diff
diff --git a/.superpowers/sdd/reports/task-6-report.md b/.superpowers/sdd/reports/task-6-report.md
new file mode 100644
index 0000000..05ee873
--- /dev/null
+++ b/.superpowers/sdd/reports/task-6-report.md
@@ -0,0 +1,36 @@
+# Task 6 Report: Fynn transaction proposals and confirmation
+
+## Status
+
+DONE_WITH_CONCERNS
+
+## Delivered
+
+- Added transaction proposal tools for create, update, and delete. They validate transaction values and owned accounts, then create a pending `fynn_proposals` row with a ten-minute expiry; no transaction mutation occurs during proposal creation.
+- Added `fynn-confirm`, which uses the authenticated request client, ignores client-provided user identity, expires stale proposals, rejects without mutation, and applies accepted transaction proposals through the user JWT client.
+- Added proposal responses to `fynn-chat`, the `confirmFynnProposal` client API, and Accept / Reject cards in the Fynn UI.
+
+## Verification
+
+- `npx deno test supabase/functions/fynn-chat/index.test.ts supabase/functions/fynn-confirm/index.test.ts` ÔÇö 5 passed.
+- `npx tsc --noEmit --pretty false` ÔÇö passed.
+- `npx expo lint` ÔÇö passed with 23 existing workspace warnings and no errors.
+- `git diff --check` ÔÇö passed.
+
+## Concerns
+
+- Deployments for `fynn-chat` and `fynn-confirm` both failed before upload with Supabase HTTP 403: the configured account lacks privileges to list/deploy functions. Docker was also unavailable.
+- The `fynn_proposals` migration must be applied to the target database before either function can persist or resolve proposals.
+
+## Fixes
+
+- `applyProposal` now maps the stored snake_case transaction payload (`account_id`, `to_account_id`, `transaction_date`, and related fields) back to the validated transaction input shape. The added integration-style Deno test captures the `transactions` insert and verifies the full row created from a snake_case proposal payload.
+- `fynn-confirm` now atomically claims an accept or reject with `id`, `user_id`, `status = pending`, and unexpired conditions before applying. A failed apply rolls an accepted claim back to pending; a lost claim returns without applying.
+- Confirmation state in the Fynn UI is now tracked per proposal ID, so one proposalÔÇÖs in-flight request does not disable other proposal cards.
+
+### Verification
+
+- `npx deno test supabase/functions/fynn-chat/index.test.ts supabase/functions/fynn-confirm/index.test.ts supabase/functions/_shared/tools/apply.test.ts` ÔÇö 7 passed, 0 failed.
+- `npx tsc --noEmit --pretty false` ÔÇö exit 0.
+- `npx expo lint` ÔÇö exit 0; 23 existing workspace warnings, no errors.
+- `git diff --check` ÔÇö exit 0.
diff --git a/app/(tabs)/fynn.tsx b/app/(tabs)/fynn.tsx
index 47ffeea..437ee83 100644
--- a/app/(tabs)/fynn.tsx
+++ b/app/(tabs)/fynn.tsx
@@ -1,8 +1,8 @@
 import ScreenWrapper from '@/components/ScreenWrapper'
 import Typo from '@/components/Typo'
-import { sendFynnMessage } from '@/lib/services/fynn'
+import { confirmFynnProposal, sendFynnMessage } from '@/lib/services/fynn'
 import { LinearGradient } from 'expo-linear-gradient'
 import { ArrowUp, Heart, List, Plus, X } from 'phosphor-react-native'
 import React, { useEffect, useRef, useState } from 'react'
 import {
   Animated,
@@ -14,11 +14,21 @@ import {
   TouchableOpacity,
   View,
 } from 'react-native'
 import { useSafeAreaInsets } from 'react-native-safe-area-context'
 
-type ChatMessage = { id: string; role: 'assistant' | 'user'; text: string }
+type ChatMessage = {
+  id: string
+  role: 'assistant' | 'user'
+  text: string
+  proposal?: {
+    id: string
+    summary: string
+    preview: unknown
+    status: 'pending' | 'accepted' | 'rejected'
+  }
+}
 type Chat = { id: string; title: string; messages: ChatMessage[] }
 
 const starterPrompts = [
   'Help me build a budget',
   'Where can I save this month?',
@@ -31,10 +41,11 @@ export default function Fynn() {
   const [chats, setChats] = useState<Chat[]>([])
   const [activeChatId, setActiveChatId] = useState<string | null>(null)
   const [draft, setDraft] = useState('')
   const [isSidebarOpen, setIsSidebarOpen] = useState(false)
   const [isSending, setIsSending] = useState(false)
+  const [confirmingProposalIds, setConfirmingProposalIds] = useState<string[]>([])
 
   const activeChat = chats.find((chat) => chat.id === activeChatId)
   const messages = activeChat?.messages ?? []
 
   useEffect(() => {
@@ -90,13 +101,23 @@ export default function Fynn() {
     try {
       const response = await sendFynnMessage(cleanText, history)
       const assistantMessage: ChatMessage = {
         id: `${timestamp}-assistant`,
         role: 'assistant',
-        text: response.success && response.data?.type === 'message'
-          ? response.data.text
-          : response.msg || 'Fynn could not respond. Please try again.',
+        text: response.success && response.data?.type === 'proposal'
+          ? response.data.text || 'Please confirm this change.'
+          : response.success && response.data?.type === 'message'
+            ? response.data.text
+            : response.msg || 'Fynn could not respond. Please try again.',
+        proposal: response.success && response.data?.type === 'proposal'
+          ? {
+              id: response.data.proposalId,
+              summary: response.data.summary,
+              preview: response.data.preview,
+              status: 'pending',
+            }
+          : undefined,
       }
       setChats((current) => current.map((chat) => (
         chat.id === chatId
           ? { ...chat, messages: [...chat.messages, assistantMessage] }
           : chat
@@ -120,10 +141,50 @@ export default function Fynn() {
     } finally {
       setIsSending(false)
     }
   }
 
+  const confirmProposal = async (
+    chatId: string,
+    messageId: string,
+    proposalId: string,
+    action: 'accept' | 'reject'
+  ) => {
+    if (confirmingProposalIds.includes(proposalId)) return
+    setConfirmingProposalIds((current) => [...current, proposalId])
+
+    try {
+      const response = await confirmFynnProposal(proposalId, action)
+      if (!response.success) return
+
+      const status: 'accepted' | 'rejected' = action === 'accept' ? 'accepted' : 'rejected'
+      setChats((current) => current.map((chat) => (
+        chat.id === chatId
+          ? {
+              ...chat,
+              messages: [
+                ...chat.messages.map((message) => (
+                  message.id === messageId && message.proposal
+                    ? { ...message, proposal: { ...message.proposal, status } }
+                    : message
+                )),
+                ...(action === 'accept'
+                  ? [{
+                      id: `${Date.now()}-confirmation`,
+                      role: 'assistant' as const,
+                      text: 'Transaction confirmed and applied.',
+                    }]
+                  : []),
+              ],
+            }
+          : chat
+      )))
+    } finally {
+      setConfirmingProposalIds((current) => current.filter((id) => id !== proposalId))
+    }
+  }
+
   return (
     <ScreenWrapper >
       <KeyboardAvoidingView
         className="flex-1"
         behavior={'padding'}
@@ -176,10 +237,39 @@ export default function Fynn() {
                     <Heart size={14} color="#171717" weight="fill" />
                   </View> : null
                 }
                 <View className={`max-w-[82%] rounded-[18px] px-3.5 py-[11px] ${message.role === 'user' ? 'rounded-br-[5px] bg-lime-400' : 'rounded-bl-[5px] bg-neutral-800'}`}>
                   <Typo size={15} className={message.role === 'user' ? 'text-neutral-900' : 'text-neutral-100'}>{message.text}</Typo>
+                  {message.proposal ? (
+                    <View className="mt-3 rounded-xl border border-neutral-700 bg-neutral-900 p-3">
+                      <Typo size={14} fontWeight="600" className="text-neutral-100">{message.proposal.summary}</Typo>
+                      {message.proposal.status === 'pending' ? (
+                        <View className="mt-3 flex-row gap-2">
+                          <TouchableOpacity
+                            accessibilityLabel="Accept proposed transaction"
+                            disabled={confirmingProposalIds.includes(message.proposal.id)}
+                            onPress={() => confirmProposal(activeChatId!, message.id, message.proposal!.id, 'accept')}
+                            className={`flex-1 rounded-lg px-3 py-2 ${confirmingProposalIds.includes(message.proposal.id) ? 'bg-neutral-700' : 'bg-lime-400'}`}
+                          >
+                            <Typo size={13} fontWeight="600" className="text-center text-neutral-900">Accept</Typo>
+                          </TouchableOpacity>
+                          <TouchableOpacity
+                            accessibilityLabel="Reject proposed transaction"
+                            disabled={confirmingProposalIds.includes(message.proposal.id)}
+                            onPress={() => confirmProposal(activeChatId!, message.id, message.proposal!.id, 'reject')}
+                            className="flex-1 rounded-lg bg-neutral-700 px-3 py-2"
+                          >
+                            <Typo size={13} fontWeight="600" className="text-center text-neutral-100">Reject</Typo>
+                          </TouchableOpacity>
+                        </View>
+                      ) : (
+                        <Typo size={13} className="mt-2 text-neutral-400">
+                          {message.proposal.status === 'accepted' ? 'Accepted' : 'Rejected'}
+                        </Typo>
+                      )}
+                    </View>
+                  ) : null}
                 </View>
               </View>
             ))}
             {isSending ? (
               <View className="mb-3.5 flex-row items-end gap-2">
diff --git a/lib/services/fynn.ts b/lib/services/fynn.ts
index 3eff35d..c68afca 100644
--- a/lib/services/fynn.ts
+++ b/lib/services/fynn.ts
@@ -15,5 +15,18 @@ export async function sendFynnMessage(
 
   if (error) return { success: false, msg: error.message }
   if (data?.error) return { success: false, msg: String(data.error) }
   return { success: true, data: data as FynnChatResponse }
 }
+
+export async function confirmFynnProposal(
+  proposalId: string,
+  action: 'accept' | 'reject'
+): Promise<ResponseType & { data?: unknown }> {
+  const { data, error } = await supabase.functions.invoke('fynn-confirm', {
+    body: { proposal_id: proposalId, action },
+  })
+
+  if (error) return { success: false, msg: error.message }
+  if (data?.error) return { success: false, msg: String(data.error) }
+  return { success: true, data }
+}
diff --git a/supabase/functions/_shared/tools/apply.test.ts b/supabase/functions/_shared/tools/apply.test.ts
new file mode 100644
index 0000000..0b29903
--- /dev/null
+++ b/supabase/functions/_shared/tools/apply.test.ts
@@ -0,0 +1,58 @@
+import { assertEquals } from 'jsr:@std/assert'
+import { applyProposal } from './apply.ts'
+
+Deno.test('applyProposal creates a transaction from snake_case proposal payload', async () => {
+  const inserts: Array<Record<string, unknown>> = []
+  const accountQuery = {
+    eq: () => accountQuery,
+    maybeSingle: async () => ({ data: { id: 'account-1' }, error: null }),
+  }
+  const userClient = {
+    from: (table: string) => {
+      if (table === 'accounts') {
+        return { select: () => accountQuery }
+      }
+      if (table === 'transactions') {
+        return {
+          insert: (row: Record<string, unknown>) => {
+            inserts.push(row)
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
+  await applyProposal(userClient as never, 'user-1', {
+    tool_name: 'propose_create_transaction',
+    payload: {
+      transaction: {
+        account_id: 'account-1',
+        to_account_id: null,
+        type: 'expense',
+        category: 'Food',
+        amount: 50,
+        description: 'Tea',
+        status: 'completed',
+        transaction_date: '2026-08-08T00:00:00.000Z',
+      },
+    },
+  })
+
+  assertEquals(inserts, [{
+    user_id: 'user-1',
+    account_id: 'account-1',
+    to_account_id: null,
+    type: 'expense',
+    category: 'Food',
+    amount: 50,
+    description: 'Tea',
+    status: 'completed',
+    transaction_date: '2026-08-08T00:00:00.000Z',
+  }])
+})
diff --git a/supabase/functions/_shared/tools/apply.ts b/supabase/functions/_shared/tools/apply.ts
new file mode 100644
index 0000000..f1584e9
--- /dev/null
+++ b/supabase/functions/_shared/tools/apply.ts
@@ -0,0 +1,108 @@
+import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
+import { buildTransactionPayload, type TransactionPayload } from './proposals.ts'
+
+type Proposal = {
+  tool_name: string
+  payload: Record<string, unknown>
+}
+
+function isRecord(value: unknown): value is Record<string, unknown> {
+  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
+}
+
+function getTransactionPayload(payload: Record<string, unknown>): Record<string, unknown> {
+  if (!isRecord(payload.transaction)) throw new Error('Invalid proposal payload')
+  return payload.transaction
+}
+
+function getTransactionArgs(payload: Record<string, unknown>): Record<string, unknown> {
+  const transaction = getTransactionPayload(payload)
+  return {
+    accountId: transaction.account_id,
+    toAccountId: transaction.to_account_id,
+    type: transaction.type,
+    category: transaction.category,
+    amount: transaction.amount,
+    description: transaction.description,
+    status: transaction.status,
+    transactionDate: transaction.transaction_date,
+  }
+}
+
+function getTransactionId(payload: Record<string, unknown>): string {
+  if (typeof payload.transaction_id !== 'string' || !payload.transaction_id.trim()) {
+    throw new Error('Invalid proposal payload')
+  }
+  return payload.transaction_id
+}
+
+async function getExistingTransaction(
+  userClient: SupabaseClient,
+  userId: string,
+  transactionId: string
+): Promise<TransactionPayload> {
+  const { data, error } = await userClient
+    .from('transactions')
+    .select('account_id, to_account_id, type, category, amount, description, status, transaction_date')
+    .eq('id', transactionId)
+    .eq('user_id', userId)
+    .maybeSingle()
+
+  if (error) throw error
+  if (!data) throw new Error('Transaction not found')
+  return data as TransactionPayload
+}
+
+export async function applyProposal(
+  userClient: SupabaseClient,
+  userId: string,
+  proposal: Proposal
+): Promise<unknown> {
+  switch (proposal.tool_name) {
+    case 'propose_create_transaction': {
+      const transaction = await buildTransactionPayload(
+        userClient,
+        userId,
+        getTransactionArgs(proposal.payload)
+      )
+      const { data, error } = await userClient
+        .from('transactions')
+        .insert({ user_id: userId, ...transaction })
+        .select()
+        .single()
+      if (error) throw error
+      return data
+    }
+    case 'propose_update_transaction': {
+      const transactionId = getTransactionId(proposal.payload)
+      const existing = await getExistingTransaction(userClient, userId, transactionId)
+      const transaction = await buildTransactionPayload(
+        userClient,
+        userId,
+        getTransactionArgs(proposal.payload),
+        existing
+      )
+      const { data, error } = await userClient
+        .from('transactions')
+        .update(transaction)
+        .eq('id', transactionId)
+        .eq('user_id', userId)
+        .select()
+        .single()
+      if (error) throw error
+      return data
+    }
+    case 'propose_delete_transaction': {
+      const transactionId = getTransactionId(proposal.payload)
+      const { error } = await userClient
+        .from('transactions')
+        .delete()
+        .eq('id', transactionId)
+        .eq('user_id', userId)
+      if (error) throw error
+      return { id: transactionId }
+    }
+    default:
+      throw new Error('Unsupported proposal')
+  }
+}
diff --git a/supabase/functions/_shared/tools/catalog.ts b/supabase/functions/_shared/tools/catalog.ts
index a1bed5a..6193aa2 100644
--- a/supabase/functions/_shared/tools/catalog.ts
+++ b/supabase/functions/_shared/tools/catalog.ts
@@ -64,6 +64,57 @@ export const TOOL_DEFS: ToolDef[] = [
       type: 'object',
       properties: { limit: limitParameter },
       additionalProperties: false,
     },
   },
+  {
+    name: 'propose_create_transaction',
+    description: 'Propose creating a transaction. This does not make a change until the user confirms it.',
+    parameters: {
+      type: 'object',
+      properties: {
+        accountId: { type: 'string', description: 'Source account UUID.' },
+        toAccountId: { type: 'string', description: 'Destination account UUID for transfers.' },
+        type: { type: 'string', enum: ['expense', 'income', 'transfer'] },
+        category: { type: 'string', maxLength: 100 },
+        amount: { type: 'number', exclusiveMinimum: 0 },
+        description: { type: 'string', maxLength: 500 },
+        status: { type: 'string', enum: ['completed', 'pending', 'cancelled'] },
+        transactionDate: { type: 'string', format: 'date-time' },
+      },
+      required: ['accountId', 'type', 'amount'],
+      additionalProperties: false,
+    },
+  },
+  {
+    name: 'propose_update_transaction',
+    description: 'Propose updating a transaction. This does not make a change until the user confirms it.',
+    parameters: {
+      type: 'object',
+      properties: {
+        transactionId: { type: 'string', description: 'Transaction UUID.' },
+        accountId: { type: 'string', description: 'Source account UUID.' },
+        toAccountId: { type: 'string', description: 'Destination account UUID for transfers.' },
+        type: { type: 'string', enum: ['expense', 'income', 'transfer'] },
+        category: { type: 'string', maxLength: 100 },
+        amount: { type: 'number', exclusiveMinimum: 0 },
+        description: { type: 'string', maxLength: 500 },
+        status: { type: 'string', enum: ['completed', 'pending', 'cancelled'] },
+        transactionDate: { type: 'string', format: 'date-time' },
+      },
+      required: ['transactionId'],
+      additionalProperties: false,
+    },
+  },
+  {
+    name: 'propose_delete_transaction',
+    description: 'Propose deleting a transaction. This does not make a change until the user confirms it.',
+    parameters: {
+      type: 'object',
+      properties: {
+        transactionId: { type: 'string', description: 'Transaction UUID.' },
+      },
+      required: ['transactionId'],
+      additionalProperties: false,
+    },
+  },
 ]
diff --git a/supabase/functions/_shared/tools/executor.ts b/supabase/functions/_shared/tools/executor.ts
index d5d9c7c..714e172 100644
--- a/supabase/functions/_shared/tools/executor.ts
+++ b/supabase/functions/_shared/tools/executor.ts
@@ -5,10 +5,15 @@ import {
   listAccounts,
   listNotifications,
   listSubscriptions,
   listTransactions,
 } from './reads.ts'
+import {
+  proposeCreateTransaction,
+  proposeDeleteTransaction,
+  proposeUpdateTransaction,
+} from './proposals.ts'
 
 type ExecuteToolInput = {
   name: string
   args: Record<string, unknown>
   userId: string
@@ -38,10 +43,19 @@ export async function executeTool(
         result = await getProfile(input)
         break
       case 'list_notifications':
         result = await listNotifications(input)
         break
+      case 'propose_create_transaction':
+        result = await proposeCreateTransaction(input)
+        break
+      case 'propose_update_transaction':
+        result = await proposeUpdateTransaction(input)
+        break
+      case 'propose_delete_transaction':
+        result = await proposeDeleteTransaction(input)
+        break
       default:
         return { ok: false, error: 'Unknown tool' }
     }
 
     return { ok: true, result }
diff --git a/supabase/functions/_shared/tools/proposals.ts b/supabase/functions/_shared/tools/proposals.ts
new file mode 100644
index 0000000..4b30349
--- /dev/null
+++ b/supabase/functions/_shared/tools/proposals.ts
@@ -0,0 +1,196 @@
+import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
+
+type ToolContext = {
+  args: Record<string, unknown>
+  userId: string
+  userClient: SupabaseClient
+}
+
+export type TransactionPayload = {
+  account_id: string
+  to_account_id: string | null
+  type: 'expense' | 'income' | 'transfer'
+  category: string | null
+  amount: number
+  description: string | null
+  status: 'completed' | 'pending' | 'cancelled'
+  transaction_date: string
+}
+
+type TransactionRow = TransactionPayload & { id: string }
+
+const transactionTypes = ['expense', 'income', 'transfer'] as const
+const transactionStatuses = ['completed', 'pending', 'cancelled'] as const
+
+function optionalString(value: unknown): string | undefined {
+  return typeof value === 'string' && value.trim() ? value.trim() : undefined
+}
+
+function requiredString(value: unknown, label: string): string {
+  const parsed = optionalString(value)
+  if (!parsed) throw new Error(`${label} is required`)
+  return parsed
+}
+
+function optionalDate(value: unknown): string | undefined {
+  if (value === undefined || value === null || value === '') return undefined
+  if (typeof value !== 'string' && !(value instanceof Date)) throw new Error('Invalid transaction date')
+  const date = new Date(value)
+  if (Number.isNaN(date.getTime())) throw new Error('Invalid transaction date')
+  return date.toISOString()
+}
+
+function requiredAmount(value: unknown): number {
+  const amount = typeof value === 'number' ? value : Number(value)
+  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than 0')
+  return amount
+}
+
+async function assertAccountOwned(userClient: SupabaseClient, userId: string, accountId: string) {
+  const { data, error } = await userClient
+    .from('accounts')
+    .select('id')
+    .eq('id', accountId)
+    .eq('user_id', userId)
+    .maybeSingle()
+
+  if (error) throw error
+  if (!data) throw new Error('Account not found')
+}
+
+export async function buildTransactionPayload(
+  userClient: SupabaseClient,
+  userId: string,
+  args: Record<string, unknown>,
+  existing?: TransactionPayload
+): Promise<TransactionPayload> {
+  const accountId = optionalString(args.accountId) ?? existing?.account_id
+  if (!accountId) throw new Error('Account is required')
+
+  const type = optionalString(args.type) ?? existing?.type
+  if (!type || !transactionTypes.includes(type as typeof transactionTypes[number])) {
+    throw new Error('Invalid transaction type')
+  }
+
+  const amount = args.amount === undefined ? existing?.amount : requiredAmount(args.amount)
+  if (amount === undefined) throw new Error('Amount is required')
+
+  const toAccountId = optionalString(args.toAccountId) ?? existing?.to_account_id ?? null
+  const category = optionalString(args.category) ?? existing?.category ?? null
+  const status = optionalString(args.status) ?? existing?.status ?? 'completed'
+  const transactionDate = optionalDate(args.transactionDate ?? args.date)
+    ?? existing?.transaction_date
+    ?? new Date().toISOString()
+  const description = args.description === undefined && args.notes === undefined
+    ? existing?.description ?? null
+    : optionalString(args.description ?? args.notes) ?? null
+
+  if (!transactionStatuses.includes(status as typeof transactionStatuses[number])) {
+    throw new Error('Invalid transaction status')
+  }
+  if (type === 'transfer') {
+    if (!toAccountId) throw new Error('Destination account is required for transfers')
+    if (toAccountId === accountId) throw new Error('Choose two different accounts for transfer')
+  } else if (!category) {
+    throw new Error('Category is required for income and expense transactions')
+  }
+
+  await assertAccountOwned(userClient, userId, accountId)
+  if (type === 'transfer' && toAccountId) {
+    await assertAccountOwned(userClient, userId, toAccountId)
+  }
+
+  return {
+    account_id: accountId,
+    to_account_id: type === 'transfer' ? toAccountId : null,
+    type: type as TransactionPayload['type'],
+    category: type === 'transfer' ? null : category,
+    amount,
+    description,
+    status: status as TransactionPayload['status'],
+    transaction_date: transactionDate,
+  }
+}
+
+async function getOwnedTransaction({ args, userId, userClient }: ToolContext): Promise<TransactionRow> {
+  const transactionId = requiredString(args.transactionId, 'transactionId')
+  const { data, error } = await userClient
+    .from('transactions')
+    .select('id, account_id, to_account_id, type, category, amount, description, status, transaction_date')
+    .eq('id', transactionId)
+    .eq('user_id', userId)
+    .maybeSingle()
+
+  if (error) throw error
+  if (!data) throw new Error('Transaction not found')
+  return data as TransactionRow
+}
+
+function summaryFor(toolName: string, transaction?: TransactionPayload): string {
+  if (toolName === 'propose_delete_transaction') return 'Delete this transaction.'
+  const verb = toolName === 'propose_create_transaction' ? 'Add' : 'Update'
+  const type = transaction?.type ?? 'transaction'
+  return `${verb} a ${type} transaction for ${transaction?.amount ?? 0}.`
+}
+
+async function insertProposal(
+  userClient: SupabaseClient,
+  userId: string,
+  toolName: string,
+  payload: Record<string, unknown>,
+  summary: string,
+  preview: unknown
+) {
+  const { data, error } = await userClient
+    .from('fynn_proposals')
+    .insert({
+      user_id: userId,
+      tool_name: toolName,
+      payload,
+      summary,
+      status: 'pending',
+      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
+    })
+    .select('id')
+    .single()
+
+  if (error) throw error
+  return { proposal_id: data.id, summary, preview }
+}
+
+export async function proposeCreateTransaction(context: ToolContext) {
+  const transaction = await buildTransactionPayload(context.userClient, context.userId, context.args)
+  return insertProposal(
+    context.userClient,
+    context.userId,
+    'propose_create_transaction',
+    { transaction },
+    summaryFor('propose_create_transaction', transaction),
+    transaction
+  )
+}
+
+export async function proposeUpdateTransaction(context: ToolContext) {
+  const existing = await getOwnedTransaction(context)
+  const transaction = await buildTransactionPayload(context.userClient, context.userId, context.args, existing)
+  return insertProposal(
+    context.userClient,
+    context.userId,
+    'propose_update_transaction',
+    { transaction_id: existing.id, transaction },
+    summaryFor('propose_update_transaction', transaction),
+    { id: existing.id, ...transaction }
+  )
+}
+
+export async function proposeDeleteTransaction(context: ToolContext) {
+  const transaction = await getOwnedTransaction(context)
+  return insertProposal(
+    context.userClient,
+    context.userId,
+    'propose_delete_transaction',
+    { transaction_id: transaction.id },
+    summaryFor('propose_delete_transaction'),
+    transaction
+  )
+}
diff --git a/supabase/functions/fynn-chat/index.test.ts b/supabase/functions/fynn-chat/index.test.ts
index 67ad6f9..046966b 100644
--- a/supabase/functions/fynn-chat/index.test.ts
+++ b/supabase/functions/fynn-chat/index.test.ts
@@ -1,10 +1,17 @@
 import { assertEquals, assertStringIncludes } from 'jsr:@std/assert'
 import { createFynnChatHandler } from './index.ts'
 
 Deno.test('Fynn chat executes read tools and returns the follow-up message', async () => {
-  const providerInputs: Array<{ messages: Array<{ role: string; content: string }> }> = []
+  const providerInputs: Array<{
+    messages: Array<{
+      role: string
+      content: string
+      toolCallId?: string
+      name?: string
+    }>
+  }> = []
   let completionCount = 0
   const handler = createFynnChatHandler({
     getAuthedUserClient: async () => ({ user: { id: 'user-1' }, userClient: {} }),
     getLlmProvider: () => ({
       complete: async (input) => {
@@ -35,19 +42,62 @@ Deno.test('Fynn chat executes read tools and returns the follow-up message', asy
   )
 
   assertEquals(response.status, 200)
   assertEquals(await response.json(), { type: 'message', text: 'You have one account.' })
   assertEquals(providerInputs.length, 2)
-  assertStringIncludes(providerInputs[0].messages[0].content, 'never invent balances')
+  assertStringIncludes(providerInputs[0].messages[0].content, 'Never invent balances')
   assertEquals(providerInputs[1].messages.at(-1), {
     role: 'tool',
     content: JSON.stringify({ ok: true, result: [{ name: 'Checking', balance: 12500 }] }),
     toolCallId: 'call-1',
     name: 'list_accounts',
   })
 })
 
+Deno.test('Fynn chat returns a proposal immediately after a propose tool succeeds', async () => {
+  let completions = 0
+  const handler = createFynnChatHandler({
+    getAuthedUserClient: async () => ({ user: { id: 'user-1' }, userClient: {} }),
+    getLlmProvider: () => ({
+      complete: async () => {
+        completions += 1
+        return {
+          toolCalls: [{
+            id: 'proposal-call',
+            name: 'propose_create_transaction',
+            arguments: { amount: 50, type: 'expense', accountId: 'account-1', category: 'dining' },
+          }],
+        }
+      },
+    }),
+    executeTool: async () => ({
+      ok: true,
+      result: {
+        proposal_id: 'proposal-1',
+        summary: 'Add a Ôé╣50 Dining expense.',
+        preview: { amount: 50, type: 'expense' },
+      },
+    }),
+  })
+
+  const response = await handler(
+    new Request('http://localhost/fynn-chat', {
+      method: 'POST',
+      body: JSON.stringify({ message: 'Add expense Ôé╣50 for tea', history: [] }),
+    })
+  )
+
+  assertEquals(response.status, 200)
+  assertEquals(await response.json(), {
+    type: 'proposal',
+    proposalId: 'proposal-1',
+    summary: 'Add a Ôé╣50 Dining expense.',
+    preview: { amount: 50, type: 'expense' },
+  })
+  assertEquals(completions, 1)
+})
+
 Deno.test('Fynn chat stops after six tool iterations', async () => {
   let calls = 0
   const handler = createFynnChatHandler({
     getAuthedUserClient: async () => ({ user: { id: 'user-1' }, userClient: {} }),
     getLlmProvider: () => ({
diff --git a/supabase/functions/fynn-chat/index.ts b/supabase/functions/fynn-chat/index.ts
index 83f5675..41af5fa 100644
--- a/supabase/functions/fynn-chat/index.ts
+++ b/supabase/functions/fynn-chat/index.ts
@@ -7,10 +7,16 @@ import { executeTool } from '../_shared/tools/executor.ts'
 
 const MAX_TOOL_ITERATIONS = 6
 
 type ToolResult = { ok: true; result: unknown } | { ok: false; error: string }
 
+type ProposalResult = {
+  proposal_id: string
+  summary: string
+  preview: unknown
+}
+
 type FynnChatDependencies = {
   getAuthedUserClient: (req: Request) => Promise<{
     user: { id: string }
     userClient: any
   }>
@@ -23,10 +29,20 @@ type FynnChatDependencies = {
   }) => Promise<ToolResult>
 }
 
 const systemPrompt = `You are Fynn, a helpful personal finance assistant. Use the available tools to answer questions about this user's money data. Never invent balances, transactions, subscriptions, or other financial data. Only use the listed tools, and clearly say when the data is unavailable.`
 
+function proposalResult(value: unknown): ProposalResult | null {
+  if (!value || typeof value !== 'object') return null
+  const result = value as Record<string, unknown>
+  return typeof result.proposal_id === 'string'
+    && typeof result.summary === 'string'
+    && 'preview' in result
+    ? result as ProposalResult
+    : null
+}
+
 function parseMessages(
   history: unknown,
   message: unknown
 ): ChatMessage[] | null {
   if (typeof message !== 'string' || !message.trim()) return null
@@ -94,10 +110,21 @@ export function createFynnChatHandler(
             name: toolCall.name,
             args: toolCall.arguments,
             userId: user.id,
             userClient,
           })
+          if (result.ok) {
+            const proposal = proposalResult(result.result)
+            if (proposal) {
+              return json({
+                type: 'proposal',
+                proposalId: proposal.proposal_id,
+                summary: proposal.summary,
+                preview: proposal.preview,
+              })
+            }
+          }
           messages.push({
             role: 'tool',
             content: JSON.stringify(result),
             toolCallId: toolCall.id,
             name: toolCall.name,
diff --git a/supabase/functions/fynn-confirm/index.test.ts b/supabase/functions/fynn-confirm/index.test.ts
new file mode 100644
index 0000000..dacda53
--- /dev/null
+++ b/supabase/functions/fynn-confirm/index.test.ts
@@ -0,0 +1,106 @@
+import { assertEquals } from 'jsr:@std/assert'
+import { createFynnConfirmHandler } from './index.ts'
+
+Deno.test('Fynn confirm rejects the authenticated user pending proposal without applying it', async () => {
+  let applied = false
+  const claims: Array<Record<string, unknown>> = []
+  const handler = createFynnConfirmHandler({
+    getAuthedUserClient: async () => ({ user: { id: 'user-1' }, userClient: {} }),
+    getProposal: async () => ({
+      id: 'proposal-1',
+      user_id: 'user-1',
+      tool_name: 'propose_create_transaction',
+      payload: {},
+      status: 'pending',
+      expires_at: new Date(Date.now() + 60_000).toISOString(),
+    }),
+    updateProposal: async () => {},
+    claimProposal: async (_client, id, userId, status) => {
+      claims.push({ id, userId, status })
+      return {
+        id: 'proposal-1',
+        user_id: 'user-1',
+        tool_name: 'propose_create_transaction',
+        payload: {},
+        status: 'rejected',
+        expires_at: new Date(Date.now() + 60_000).toISOString(),
+      }
+    },
+    rollbackAcceptedProposal: async () => {},
+    applyProposal: async () => {
+      applied = true
+      return {}
+    },
+  })
+
+  const response = await handler(new Request('http://localhost/fynn-confirm', {
+    method: 'POST',
+    body: JSON.stringify({ proposal_id: 'proposal-1', action: 'reject' }),
+  }))
+
+  assertEquals(response.status, 200)
+  assertEquals(await response.json(), { success: true, status: 'rejected' })
+  assertEquals(applied, false)
+  assertEquals(claims, [{ id: 'proposal-1', userId: 'user-1', status: 'rejected' }])
+})
+
+Deno.test('Fynn confirm expires a stale proposal without applying it', async () => {
+  const updates: Array<Record<string, unknown>> = []
+  const handler = createFynnConfirmHandler({
+    getAuthedUserClient: async () => ({ user: { id: 'user-1' }, userClient: {} }),
+    getProposal: async () => ({
+      id: 'proposal-1',
+      user_id: 'user-1',
+      tool_name: 'propose_create_transaction',
+      payload: {},
+      status: 'pending',
+      expires_at: new Date(Date.now() - 1).toISOString(),
+    }),
+    updateProposal: async (_client, id, patch) => {
+      updates.push({ id, ...patch })
+    },
+    claimProposal: async () => null,
+    rollbackAcceptedProposal: async () => {},
+    applyProposal: async () => ({}),
+  })
+
+  const response = await handler(new Request('http://localhost/fynn-confirm', {
+    method: 'POST',
+    body: JSON.stringify({ proposal_id: 'proposal-1', action: 'accept' }),
+  }))
+
+  assertEquals(response.status, 400)
+  assertEquals(await response.json(), { error: 'Proposal has expired' })
+  assertEquals(updates[0].status, 'expired')
+})
+
+Deno.test('Fynn confirm does not apply a proposal when an atomic claim loses the race', async () => {
+  let applied = false
+  const handler = createFynnConfirmHandler({
+    getAuthedUserClient: async () => ({ user: { id: 'user-1' }, userClient: {} }),
+    getProposal: async () => ({
+      id: 'proposal-1',
+      user_id: 'user-1',
+      tool_name: 'propose_create_transaction',
+      payload: {},
+      status: 'pending',
+      expires_at: new Date(Date.now() + 60_000).toISOString(),
+    }),
+    claimProposal: async () => null,
+    updateProposal: async () => {},
+    rollbackAcceptedProposal: async () => {},
+    applyProposal: async () => {
+      applied = true
+      return {}
+    },
+  })
+
+  const response = await handler(new Request('http://localhost/fynn-confirm', {
+    method: 'POST',
+    body: JSON.stringify({ proposal_id: 'proposal-1', action: 'accept' }),
+  }))
+
+  assertEquals(response.status, 404)
+  assertEquals(await response.json(), { error: 'Proposal not found or already resolved' })
+  assertEquals(applied, false)
+})
diff --git a/supabase/functions/fynn-confirm/index.ts b/supabase/functions/fynn-confirm/index.ts
new file mode 100644
index 0000000..772b01c
--- /dev/null
+++ b/supabase/functions/fynn-confirm/index.ts
@@ -0,0 +1,155 @@
+import { getAuthedUserClient } from '../_shared/auth.ts'
+import { corsHeaders, json } from '../_shared/cors.ts'
+import { applyProposal } from '../_shared/tools/apply.ts'
+
+type Proposal = {
+  id: string
+  user_id: string
+  tool_name: string
+  payload: Record<string, unknown>
+  status: 'pending' | 'accepted' | 'rejected' | 'expired'
+  expires_at: string
+}
+
+type FynnConfirmDependencies = {
+  getAuthedUserClient: (req: Request) => Promise<{
+    user: { id: string }
+    userClient: any
+  }>
+  getProposal: (userClient: any, proposalId: string, userId: string) => Promise<Proposal | null>
+  claimProposal: (
+    userClient: any,
+    proposalId: string,
+    userId: string,
+    status: 'accepted' | 'rejected'
+  ) => Promise<Proposal | null>
+  updateProposal: (
+    userClient: any,
+    proposalId: string,
+    patch: { status: 'accepted' | 'rejected' | 'expired'; resolved_at: string }
+  ) => Promise<void>
+  rollbackAcceptedProposal: (userClient: any, proposalId: string, userId: string) => Promise<void>
+  applyProposal: (userClient: any, userId: string, proposal: Proposal) => Promise<unknown>
+}
+
+async function getProposal(userClient: any, proposalId: string, userId: string): Promise<Proposal | null> {
+  const { data, error } = await userClient
+    .from('fynn_proposals')
+    .select('id, user_id, tool_name, payload, status, expires_at')
+    .eq('id', proposalId)
+    .eq('user_id', userId)
+    .eq('status', 'pending')
+    .maybeSingle()
+  if (error) throw error
+  return data as Proposal | null
+}
+
+async function claimProposal(
+  userClient: any,
+  proposalId: string,
+  userId: string,
+  status: 'accepted' | 'rejected'
+): Promise<Proposal | null> {
+  const { data, error } = await userClient
+    .from('fynn_proposals')
+    .update({ status, resolved_at: new Date().toISOString() })
+    .eq('id', proposalId)
+    .eq('user_id', userId)
+    .eq('status', 'pending')
+    .gt('expires_at', new Date().toISOString())
+    .select('id, user_id, tool_name, payload, status, expires_at')
+    .maybeSingle()
+  if (error) throw error
+  return data as Proposal | null
+}
+
+async function updateProposal(
+  userClient: any,
+  proposalId: string,
+  patch: { status: 'accepted' | 'rejected' | 'expired'; resolved_at: string }
+) {
+  const { error } = await userClient
+    .from('fynn_proposals')
+    .update(patch)
+    .eq('id', proposalId)
+  if (error) throw error
+}
+
+async function rollbackAcceptedProposal(userClient: any, proposalId: string, userId: string) {
+  const { error } = await userClient
+    .from('fynn_proposals')
+    .update({ status: 'pending', resolved_at: null })
+    .eq('id', proposalId)
+    .eq('user_id', userId)
+    .eq('status', 'accepted')
+  if (error) throw error
+}
+
+function parseRequest(body: unknown): { proposalId: string; action: 'accept' | 'reject' } | null {
+  if (!body || typeof body !== 'object') return null
+  const { proposal_id: proposalId, action } = body as Record<string, unknown>
+  if (typeof proposalId !== 'string' || !proposalId.trim()) return null
+  if (action !== 'accept' && action !== 'reject') return null
+  return { proposalId, action }
+}
+
+export function createFynnConfirmHandler(
+  dependencies: FynnConfirmDependencies = {
+    getAuthedUserClient,
+    getProposal,
+    claimProposal,
+    updateProposal,
+    rollbackAcceptedProposal,
+    applyProposal,
+  }
+) {
+  return async (req: Request): Promise<Response> => {
+    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
+    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
+
+    try {
+      const body = parseRequest(await req.json().catch(() => null))
+      if (!body) return json({ error: 'proposal_id and action are required' }, 400)
+
+      const { user, userClient } = await dependencies.getAuthedUserClient(req)
+      const proposal = await dependencies.getProposal(userClient, body.proposalId, user.id)
+      if (!proposal) return json({ error: 'Proposal not found or already resolved' }, 404)
+
+      const resolvedAt = new Date().toISOString()
+      if (new Date(proposal.expires_at).getTime() < Date.now()) {
+        await dependencies.updateProposal(userClient, proposal.id, {
+          status: 'expired',
+          resolved_at: resolvedAt,
+        })
+        return json({ error: 'Proposal has expired' }, 400)
+      }
+
+      if (body.action === 'reject') {
+        const claimed = await dependencies.claimProposal(userClient, proposal.id, user.id, 'rejected')
+        if (!claimed) return json({ error: 'Proposal not found or already resolved' }, 404)
+        return json({ success: true, status: 'rejected' })
+      }
+
+      const claimed = await dependencies.claimProposal(userClient, proposal.id, user.id, 'accepted')
+      if (!claimed) return json({ error: 'Proposal not found or already resolved' }, 404)
+
+      let data: unknown
+      try {
+        data = await dependencies.applyProposal(userClient, user.id, claimed)
+      } catch (error) {
+        await dependencies.rollbackAcceptedProposal(userClient, proposal.id, user.id)
+        throw error
+      }
+      return json({ success: true, status: 'accepted', data })
+    } catch (error) {
+      return json(
+        { error: error instanceof Error ? error.message : 'Unable to confirm proposal' },
+        400
+      )
+    }
+  }
+}
+
+if (import.meta.main) {
+  Deno.serve(createFynnConfirmHandler())
+}

```
