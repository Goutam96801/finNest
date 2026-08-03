# FinNest Statistics page design

**Date:** 2026-08-03  
**Status:** Implemented  
**Approach:** Client-side aggregation (A)

## Goal

Statistics tab shows spending overview for a selected period: totals, trend, and category breakdown. Matches existing FinNest dark UI (lime accents, soft refresh, centered loader/empty states, custom alerts where needed).

## Scope (v1)

### Included
- Period control via `@react-native-segmented-control/segmented-control` (Weekly / Monthly / Yearly)
- Top scrollable grouped **bar chart** (income + expense) via `react-native-gifted-charts`
- Separate **trend line chart** (curved dual series) with its own Weekly / Monthly / Yearly control
- **Donut/pie chart** for expense categories (uses overview period)
- Account filter (All + single account)
- Soft refresh; centered loader / empty states

### Removed from v1 UI
- Prev/next range arrows
- Custom date range
- Income / Expense / Net summary cards

### Out of scope (v1)
- Export / PDF
- Budget goals
- Comparing two periods side-by-side
- Server-side RPC/views (can migrate later if volume grows)

## UI layout

Scrollable screen:

1. Header — “Statistics”
2. Period pills — Week | Month | Year | Custom (lime active)
3. Range control
   - **Preset modes:** `<` · range label · `>`  
     Examples: `28 Jul – 3 Aug`, `August 2026`, `2026`  
     Next disabled when the next window would start after today; past is unrestricted
   - **Custom mode:** From / To date fields (YYYY-MM-DD); prev/next hidden
4. Account filter — SelectField → BottomSheetSelect (“All accounts” + accounts with Primary labels)
5. Summary row — Income (green) | Expense (rose) | Net (lime if ≥ 0, rose if negative)
6. Trend chart — dual series (income / expense) via `react-native-gifted-charts`
7. Category breakdown — ranked expense categories with bar/%/amount
8. Loading / empty — shared `Loading` and `EmptyState` patterns

Animations: `FadeInDown` on major sections.

## Period rules

| Mode | Default window | Prev/next | Buckets for chart |
|------|----------------|-----------|-------------------|
| Week | Last 7 days ending today (when offset 0) | Shift by 7 days | Daily (7 points) |
| Month | Current calendar month | Shift by 1 calendar month | Weekly buckets within month |
| Year | Current calendar year | Shift by 1 year | Monthly (12 points, or months to date for current year) |
| Custom | User From–To (inclusive) | N/A | Adaptive: ≤14 days → daily; ≤90 days → weekly; else monthly |

- Date boundaries use start-of-day local semantics; store/compare with ISO timestamps consistently with existing transaction dates.
- Switching from Custom back to a preset resets offset to **0** (current window for that pill).
- Invalid custom range (from > to): show app alert and do not fetch.

## Data & architecture

**Service:** `lib/services/statistics.ts`

```ts
getStatistics({
  userId: string
  from: string   // ISO date or timestamptz start
  to: string     // ISO date or timestamptz end (inclusive day)
  accountId?: string | null  // null/undefined = all
}): Promise<{
  income: number
  expense: number
  net: number
  series: { label: string; income: number; expense: number }[]
  categories: { category: string; label: string; amount: number; percent: number }[]
}>
```

**Query rules**
- `status = 'completed'`
- `type IN ('income', 'expense')` — transfers excluded
- `transaction_date` within `[from, to]`
- Optional `account_id = accountId`

**Aggregation**
- Totals summed client-side from returned rows (or select only needed columns)
- Categories: expense rows only; unknown slug → `others`; percent = amount / expense total (0 if no expense)
- Series buckets assigned by local calendar of `transaction_date`

**UI pieces**
- Rewrite `app/(tabs)/statistics.tsx`
- Small helpers/components as needed: period pills, range navigator, category list
- Reuse: `ScreenWrapper`, `Typo`, `SelectField`, `BottomSheetSelect`, `Loading`, `EmptyState`, `showAlert`

**Dependency**
- Custom `TrendChart` (View-based bars) — avoids Expo Metro issues with `react-native-gifted-charts`

## Edge cases

- No rows in range → zeros in summary; empty copy for chart/categories
- Account with no activity → same
- Net negative → rose color
- Soft refresh: keep previous payload visible while refetching
- First visit / no cached data → centered loader

## Testing (manual)

- [ ] Week/Month/Year pills switch windows and chart buckets
- [ ] Prev/next updates label and data; next disabled at “today” boundary
- [ ] Custom from/to filters correctly; invalid range alerts
- [ ] All vs single account changes totals
- [ ] Transfers do not affect income/expense
- [ ] Empty period shows empty state; loader only on cold load
- [ ] Seeded user data renders meaningful charts
