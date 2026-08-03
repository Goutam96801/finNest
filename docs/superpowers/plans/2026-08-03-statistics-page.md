# Statistics Page Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Build the Statistics tab with period/range filters, account filter, summary, trend chart, and category breakdown (client-side aggregation).

**Architecture:** Fetch completed income/expense rows for `[from, to]` (+ optional account), aggregate totals/series/categories in `lib/services/statistics.ts`. UI in `app/(tabs)/statistics.tsx` with gifted-charts.

**Tech Stack:** Expo 54, React Native, Supabase, `react-native-gifted-charts`, existing FinNest UI components.

**Spec:** `docs/superpowers/specs/2026-08-03-statistics-page-design.md`

## Global Constraints

- Expo SDK 54 — do not upgrade
- Exclude transfers from stats
- Soft refresh (no loader flash when data exists)
- Match dark theme / lime accents

---

### Task 1: Dependency + statistics service

- [x] Install `react-native-gifted-charts` and `react-native-svg` (peer)
- [x] Add `lib/services/statistics.ts` with period helpers + `getStatistics`
- [x] Unit-style sanity: week/month/year window helpers exportable

### Task 2: Statistics screen UI

- [x] Rewrite `app/(tabs)/statistics.tsx`
- [x] Period pills, prev/next, custom from/to, account sheet
- [x] Summary + BarChart trend + category list
- [x] Loading / empty / soft refresh / FadeInDown

### Task 3: Spec status + smoke check

- [x] Mark design spec Approved / implemented
- [x] Typecheck changed files
