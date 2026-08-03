# Global search design

**Date:** 2026-08-03  
**Status:** Implemented  
**Approach:** Full-screen search modal (A)

## Goal

Home search icon opens a modal that searches **accounts, transactions, subscriptions, and notifications**. Tap a result opens the matching detail screen/modal.

## Scope

### Included
- Route `/(modals)/searchModal` with autofocus search input
- Debounced query (~300ms); parallel Supabase `ilike` queries; limit ~8 per type
- Grouped sections: Accounts, Transactions, Subscriptions, Notifications
- Navigation: account → account modal; transaction → transaction modal; subscription → `/subscriptions`; notification → notifications modal
- Empty hint, loading, no-results states

### Out of scope
- Screen/nav shortcuts, Postgres RPC, recent-search history

## Search fields

| Type | Fields |
|------|--------|
| Accounts | name, bank_name, type |
| Transactions | description, category, type |
| Subscriptions | name, notes, category |
| Notifications | title, body |
