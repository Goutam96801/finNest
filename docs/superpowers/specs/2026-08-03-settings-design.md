# Settings screen design

**Date:** 2026-08-03  
**Status:** Implemented  
**Export:** In-app CSV/PDF via Storage bucket `exports` (no email)  
**Week start:** Any weekday via bottom sheet  

## Goal

Profile → Settings with device prefs, DB notification prefs, email CSV export, auth account actions, feedback to DB, and About.

## Storage

### Device (AsyncStorage)
- `balanceHidden` — home eye preference
- `weekStartsOn` — `0` Sunday | `1` Monday (stats + “this week” filters)

### Database
- Extend `profiles` (or `user_settings` 1:1):  
  `subscription_reminders_enabled`, `low_balance_alerts_enabled`, `low_balance_threshold`, `deleted_at`
- `feedback`: `id`, `user_id`, `type` (`contact` | `rate` | `feedback`), `message`, `rating` (nullable 1–5), `created_at`

### Not in Settings
- Currency — already on Edit Profile (`profiles.currency`)
- Number format — out of scope

## Features

| Feature | Behavior |
|---------|----------|
| Balance visibility | Toggle; home eye reads/writes same store |
| Start of week | Sun/Mon; wire stats + date-range “this week” |
| Notification prefs | Load/save DB flags + optional threshold |
| Export data | Invoke `export-transactions` edge fn → CSV emailed to auth email only |
| Change email/password | Supabase Auth update flows |
| Delete account | Confirm → `delete-account` edge fn disables/bans auth user + sets `deleted_at` → sign out |
| Contact / Rate / Feedback | Forms → insert `feedback` |
| About | App name, version (`expo-constants`), link Privacy Policy |

## Edge functions
- `export-transactions`: verify JWT, fetch user transactions, build CSV, email to `user.email` only
- `delete-account`: verify JWT, set `profiles.deleted_at`, ban/disable auth user via service role

## Out of scope
- Hard delete of rows, push provider implementation beyond storing prefs, store listing deep-link required for Rate (DB save is enough in v1)
