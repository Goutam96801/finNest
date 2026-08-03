# Transactions & notifications pagination design

**Date:** 2026-08-03  
**Status:** Implemented  
**Approach:** Offset pages + Load more button (not infinite scroll)

## Goal

Stop loading large one-shot lists. Transactions and notifications load in pages of **20**, with a **Load more** button to fetch the next page. Transaction filters/search run on the server so pagination stays correct.

## Scope

### Included
- `getTransactionsPage(userId, { limit, offset, type?, accountId?, from?, to?, search? })` → `{ items, hasMore }`
- `getNotificationsPage(userId, { limit, offset })` → `{ items, hasMore }`
- Transactions screen: server-side type / account / date / search; debounce search ~300ms; filter change resets to page 0
- Notifications modal: same paging pattern, no filters
- `ListFooterComponent`: **Load more** when `hasMore`; spinner while `loadingMore`; hidden when done
- Soft first-load / focus refresh replaces page 0 (does not keep stale pages)

### Out of scope
- Home recent transactions preview (`getRecentTransactions` stays capped)
- Infinite `onEndReached` scrolling
- Cursor/keyset pagination
- Stats queries

## Pagination rules

- Page size: **20**
- Offset: `items.length` when appending (reset to `0` on filter/focus refresh)
- `hasMore`: `items.length === limit` for that response (fetch `limit` rows; if fewer, no more)
- Ordering unchanged:
  - Transactions: `transaction_date` desc, then `created_at` desc
  - Notifications: `created_at` desc

## Transaction filters (server)

| Filter | Query behavior |
|--------|----------------|
| Type | `eq('type', …)` when not `all` |
| Account | match `account_id` **or** `to_account_id` |
| Date | `gte` / `lte` on `transaction_date` from resolved range bounds |
| Search | `ilike` on `description` and/or `category` (and type label if needed via `or`) |

Client-side `filtered` memo is removed; list data is the server page result.

## UI

- Initial empty + loading: existing centered `Loading`
- Empty after load: existing `EmptyState` copy (matching vs none)
- Footer button: rounded, neutral/dark, lime label “Load more”; disabled + spinner while loading more
- Mark notification read / read all: keep current behavior; refresh from page 0 (or patch local unread flag for single read without full reset — prefer simple page-0 reload for consistency)

## Acceptance

1. Transactions first paint shows ≤20 rows; Load more appends next 20 until exhausted.
2. Changing type/account/date/search resets list and hides Load more until a full page returns again.
3. Notifications same Load more behavior.
4. Home still shows ~10 recent with no Load more.
5. No `onEndReached` paging.
