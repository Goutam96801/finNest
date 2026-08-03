# Bottom-sheet select + accounts create/load

**Date:** 2026-08-02  
**Status:** Approved; implementation in progress / completed in session  
**Constraint:** Stay on Expo SDK 54 (Play Store Expo Go on physical Android)

## Goal

Add a reusable Android-comfortable select (tap field → bottom sheet with labeled rows + checkmark), use it for account type and profile timezone/currency, and fix account create/load reliability against the pulled Supabase schema.

## Non-goals

- Do not upgrade Expo SDK (Material `@expo/ui` picker requires 56+).
- Do not build a custom Modal+Reanimated sheet; use `@gorhom/bottom-sheet` instead.
- Do not build transactions/categories/subscriptions tables yet (enums exist in DB only).

## Architecture

### Dependency

- Install `@gorhom/bottom-sheet` with Expo-compatible versions of its peers (project already has `react-native-reanimated` and `react-native-gesture-handler`).
- Ensure root layout already wraps the app with `GestureHandlerRootView` (add if missing).
- Use `BottomSheetModal` + `BottomSheetModalProvider` (not always-mounted `BottomSheet`) so selects can open/close from form fields without reserving screen space.
- Use `BottomSheetFlatList` / `BottomSheetScrollView` for option lists so scrolling works inside the sheet on Android.

### New UI units

1. **`SelectField`** (`components/SelectField.tsx`)
   - Read-only tappable row styled like `Input` (dark fill, border, 17px radius).
   - Shows current option label (or placeholder) and a chevron.
   - `onPress` presents the sheet; does not use a text input.

2. **`BottomSheetSelect`** (`components/BottomSheetSelect.tsx`)
   - Wraps `@gorhom/bottom-sheet` `BottomSheetModal` with dark backdrop and snap points sized for short/medium option lists.
   - Props: `title`, `options: { label, value }[]`, `value`, `onChange(value)`, plus a ref/`present()` API (or controlled `visible` that maps to `present`/`dismiss`).
   - Option rows via `BottomSheetFlatList`; selected row shows a Phosphor checkmark.
   - Tap backdrop or row → dismiss; row also commits selection.
   - Safe-area aware bottom padding for Android gesture nav.
   - Theme sheet background to match app dark surfaces (`#171717` / `#262626`).

### Data mapping

3. **Account mappers** in `lib/services/accounts.ts` (or small `lib/mappers/account.ts`)
   - DB row (snake_case) → app `Account` (camelCase).
   - App payload → insert payload (already mostly done in `createAccount`).
   - `getAccounts` returns mapped `Account[]`.
   - Filter out `is_archived === true` by default.

### Account type options

4. Add `ACCOUNT_TYPE_OPTIONS` to `constants/index.ts` matching `public.account_type` enum:
   - bank, cash, wallet, credit_card, investment, loan, other (human labels).

## Data flow

### Create

1. User fills `accountModal`, including type via `SelectField` / `BottomSheetSelect`.
2. Client validates: non-empty name; last4 empty → `null`, else must match `^[0-9]{4}$` (matches DB `last4_check`).
3. `createAccount(userId, data)` inserts with mapped columns; returns mapped `Account` on success.
4. On success → `router.back()`.

### Load / refresh

1. `accounts` tab loads with `useFocusEffect` (not mount-only `useEffect`) so returning from the modal refetches.
2. Total balance sums mapped `balance` values.
3. List keys use `account.id`.

### Profile selects

1. Replace `@react-native-picker/picker` in `profileModal` for timezone and currency with the same `SelectField` + `BottomSheetSelect`, using existing `TIMEZONE_OPTIONS` / `CURRENCY_OPTIONS`.

## Error handling

- Create: keep Alert on validation/API failure; surface DB messages (e.g. last4 check) via `error.message`.
- Load: keep console log; show empty state if fetch fails (no crash).
- Sheet: ensure `present`/`dismiss` are idempotent; clear selection UI when options/`value` change.

## Testing (manual, Expo Go Android)

1. Open New Account → tap Account type → sheet slides up → select Credit Card → field shows label → save succeeds.
2. Enter last4 `12` → save fails with clear message; `1234` succeeds; empty succeeds.
3. After save, Accounts tab shows the new row without killing the app.
4. Profile → timezone/currency open the same sheet pattern and save still works.

## Files to touch

| File | Change |
|------|--------|
| `package.json` / lockfile | Add `@gorhom/bottom-sheet` via `npx expo install` |
| `app/_layout.tsx` | Ensure `GestureHandlerRootView` + `BottomSheetModalProvider` |
| `components/SelectField.tsx` | Create |
| `components/BottomSheetSelect.tsx` | Create (`BottomSheetModal` wrapper) |
| `constants/index.ts` | Add `ACCOUNT_TYPE_OPTIONS` |
| `lib/services/accounts.ts` | Mapping, archive filter, last4 validation |
| `lib/types.ts` | Align `Account` with DB if needed |
| `app/(modals)/accountModal.tsx` | Type select + last4 UX |
| `app/(modals)/profileModal.tsx` | Replace native Picker |
| `app/(tabs)/accounts.tsx` | `useFocusEffect` refetch |

## Out of scope follow-ups

- Shared accounts context/store across tabs.
- `display_order` reordering UI.
- `accounts.updated_at` DB trigger (profiles already have one; accounts do not).
