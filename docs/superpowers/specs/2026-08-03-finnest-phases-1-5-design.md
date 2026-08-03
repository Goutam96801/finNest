# FinNest phases 1–5 design

**Date:** 2026-08-03  
**Status:** Phases 1–5 implemented  

## Execution

Sequential phases; app remains usable after each.

## Phase 1 — Primary account ✅

### Rules
- Creating the **first** account always sets `is_primary = true` (no choice).
- Creating/editing later accounts shows a **Primary** checkbox.
- If checked on save: clear `is_primary` on all other user accounts, then set this one primary.
- If unchecked on a non-first create: leave existing primary unchanged.
- Unchecking the current primary on edit without selecting another is blocked or reassigns is not required for v1 — prefer: at least one primary always exists; cannot uncheck primary unless another account becomes primary (or keep primary forced on if it's the only account).

### UI
- Create/edit form: checkbox (hidden/disabled auto-on for first account).
- Badge “Primary” on account list cards, account pickers (transaction form), and related account displays.

### Data
- Use existing `accounts.is_primary`.
- Enforce uniqueness in service layer (and optional SQL trigger later).

## Phase 2 — Transactions v2 ✅
- Amount, Account, Category, Date, Notes.
- Expense | Income | Transfer (from → to accounts; balance both sides).

## Phase 3 — Dashboard polish ✅
- Swipeable home cards (total + per-account).
- Notification icon → notifications modal.
- Recent list + Quick Add retained.

## Phase 4 — Subscriptions ✅
- Recurring reminders; Paid / Snooze / Skip; Paid creates transaction.

## Phase 5 — Upcoming strip ✅
- Horizontal upcoming subscriptions above recent transactions.
