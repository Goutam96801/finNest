# Transactions & Notifications Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add offset-based page loading (20 items) with a Load more button on transactions and notifications; move transaction filters to the server.

**Architecture:** Extend Supabase service helpers with `getTransactionsPage` / `getNotificationsPage` returning `{ items, hasMore }`. Screens reset to offset 0 on filter/focus refresh and append on Load more.

**Tech Stack:** Expo 54, React Native FlatList, Supabase JS client

## Global Constraints

- Page size: **20**
- **Load more button** only — no `onEndReached` infinite scroll
- Home `getRecentTransactions` unchanged
- Expo SDK 54 docs / Expo Go compatible APIs only

---

### Task 1: Transaction page service

**Files:**
- Modify: `lib/services/transactions.ts`

**Interfaces:**
- Produces: `getTransactionsPage(userId, params) => Promise<{ items: TransactionType[]; hasMore: boolean }>`

- [ ] **Step 1:** Add types and `getTransactionsPage` after `getRecentTransactions`

```ts
export type TransactionPageParams = {
  limit?: number
  offset?: number
  type?: 'expense' | 'income' | 'transfer'
  accountId?: string
  from?: string // YYYY-MM-DD
  to?: string // YYYY-MM-DD
  search?: string
}

export async function getTransactionsPage(
  userId: string,
  params: TransactionPageParams = {}
) {
  if (!userId) throw new Error('User not authenticated')
  const limit = params.limit ?? 20
  const offset = params.offset ?? 0

  let query = supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (params.type) query = query.eq('type', params.type)
  if (params.accountId) {
    query = query.or(
      `account_id.eq.${params.accountId},to_account_id.eq.${params.accountId}`
    )
  }
  if (params.from) query = query.gte('transaction_date', params.from)
  if (params.to) query = query.lte('transaction_date', params.to)
  if (params.search?.trim()) {
    const q = params.search.trim().replace(/[%_,]/g, '')
    query = query.or(`description.ilike.%${q}%,category.ilike.%${q}%,type.ilike.%${q}%`)
  }

  const { data, error } = await query
  if (error) throw error
  const items = (data as TransactionRow[]).map(mapTransactionRow)
  return { items, hasMore: items.length === limit }
}
```

- [ ] **Step 2:** Keep `getRecentTransactions` for home unchanged

---

### Task 2: Notifications page service

**Files:**
- Modify: `lib/services/notifications.ts`

**Interfaces:**
- Produces: `getNotificationsPage(userId, { limit?, offset? }) => Promise<{ items: AppNotification[]; hasMore: boolean }>`

- [ ] **Step 1:** Add `getNotificationsPage`; keep `getNotifications` as thin wrapper or leave for other callers

```ts
export async function getNotificationsPage(
  userId: string,
  params: { limit?: number; offset?: number } = {}
) {
  if (!userId) throw new Error('User not authenticated')
  const limit = params.limit ?? 20
  const offset = params.offset ?? 0

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw error
  const items = (data as NotificationRow[]).map(mapNotification)
  return { items, hasMore: items.length === limit }
}
```

---

### Task 3: Transactions screen Load more + server filters

**Files:**
- Modify: `app/transactions.tsx`
- Optionally create: `components/LoadMoreButton.tsx` (shared)

**Interfaces:**
- Consumes: `getTransactionsPage`, `resolveDateRangeBounds`

- [ ] **Step 1:** Shared footer button component

```tsx
// components/LoadMoreButton.tsx
import Typo from '@/components/Typo'
import Loading from '@/components/Loading'
import { TouchableOpacity } from 'react-native'

export default function LoadMoreButton({
  loading,
  onPress,
}: {
  loading: boolean
  onPress: () => void
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.85}
      className="mt-2 items-center justify-center rounded-2xl border border-[#404040] bg-[#171717] py-3.5"
    >
      {loading ? (
        <Loading size="small" />
      ) : (
        <Typo fontWeight="600" color="#a3e635">
          Load more
        </Typo>
      )}
    </TouchableOpacity>
  )
}
```

- [ ] **Step 2:** Replace client filter memo with server params; debounce search 300ms; `load({ reset })` / `loadMore`; footer `LoadMoreButton` when `hasMore`

---

### Task 4: Notifications modal Load more

**Files:**
- Modify: `app/(modals)/notificationsModal.tsx`

**Interfaces:**
- Consumes: `getNotificationsPage`, `LoadMoreButton`

- [ ] **Step 1:** Same reset / append / hasMore / Load more pattern; mark read reloads from page 0

---

### Task 5: Spec status + verify

- [ ] Mark design spec status Implemented
- [ ] Lint touched files
- [ ] Manual: filter reset, Load more append, notifications Load more, home unchanged
