# Fynn Pro (Razorpay prepaid) design

**Date:** 2026-08-29  
**Status:** Draft  
**Platform:** Android only (v1)  
**Payments:** Razorpay Standard Checkout (native SDK)  
**Billing:** Prepaid periods, not auto-renew  

## Goal

Gate Fynn behind a paid plan. Unsubscribed users see a blurred chat with a lock and a path to purchase. Subscribed users get 20 Fynn messages per IST calendar day. Profile opens a **Fynn Pro** screen (not the existing Netflix-style `/subscriptions` list) showing the current plan, remaining daily usage, purchase options, and past payments.

## Decisions

| Topic | Choice |
|-------|--------|
| Platforms | Android only. No iOS IAP in v1 (Apple would reject Razorpay for digital goods). |
| Plans | Monthly ₹99 → 30 days. Yearly ₹999 → 365 days. Prices include GST. |
| Daily cap | 20 user messages per IST day on **both** plans. |
| Repeat buy | Extend: new period starts at `max(now, current period_end)`. |
| Checkout | Native Razorpay Checkout. Requires a development build (`expo-dev-client`), not Expo Go. |
| Unlock source of truth | Razorpay webhook `payment.captured`. Client success is not trusted. |
| Refunds / mid-period cancel | Out of scope for v1. |

## Naming

Existing `public.subscriptions` and `app/subscriptions.tsx` are recurring **bills** (Netflix, rent). Do not reuse those names.

| UI | Route | Tables |
|----|--------|--------|
| Profile row **Fynn Pro** | `/fynn-pro` | `fynn_purchases`, `fynn_usage_daily` |

## Data model

### `fynn_purchases`

One row per checkout attempt / payment.

- `id` uuid pk
- `user_id` uuid → `profiles(id)` on delete cascade
- `plan` text check `monthly` \| `yearly`
- `amount_paise` integer not null (9900 or 99900)
- `currency` text not null default `INR`
- `status` text check `created` \| `paid` \| `failed`
- `razorpay_order_id` text unique
- `razorpay_payment_id` text unique nullable (set on capture)
- `period_start` timestamptz nullable (set on paid)
- `period_end` timestamptz nullable (set on paid)
- `created_at` / `updated_at` timestamptz

**Active entitlement:** there exists a `paid` row for this user with `period_end > now()`. Effective end is `max(period_end)` among paid rows.

**Extend on pay:**  
`period_start = max(now(), current_max_period_end)`  
`period_end = period_start + 30 days` (monthly) or `+ 365 days` (yearly).

RLS: user can `SELECT` own rows. Inserts/updates only from service role (edge functions).

### `fynn_usage_daily`

- `user_id` uuid
- `day` date (IST calendar date)
- `message_count` integer not null default 0
- primary key `(user_id, day)`

Incremented only inside `fynn-chat` after entitlement + cap checks pass, once per **user** message (not assistant tokens, not tool rounds).

RLS: user can `SELECT` own row for today. Writes only from service role.

## Payment flow

1. App calls authenticated edge function `fynn-create-order` with `{ plan: 'monthly' | 'yearly' }`.
2. Function creates a Razorpay Order (`amount` in paise, `currency` INR, `notes.user_id` + plan) and inserts `fynn_purchases` with `status = created`.
3. App opens `react-native-razorpay` with `key_id`, `order_id`, user email/name, and app theme (dark + lime).
4. User pays (UPI / card / netbanking). Cancel or failure: leave purchase as `created`/`failed`; Fynn stays locked.
5. Razorpay sends `payment.captured` to `fynn-razorpay-webhook`. Verify webhook signature. Idempotent on `razorpay_payment_id`. Set `paid`, compute `period_start` / `period_end`, store payment id.
6. App, after checkout success, polls `fynn_purchases` (latest for this user) for up to ~15s until `status = paid`, then refreshes entitlement. If still `created`, show “Still confirming — pull to refresh.”

Never grant access from the Checkout success callback alone.

## Enforcement

`fynn-chat` **before** calling OpenRouter (same entitlement check on `fynn-confirm` so an expired user cannot apply a leftover proposal):

1. If no active entitlement → `402` `{ error: 'subscription_required', code: 'SUBSCRIPTION_REQUIRED' }`.
2. Else load/create today’s IST usage row. If `message_count >= 20` → `429` `{ error: 'daily_limit', code: 'DAILY_LIMIT', used, limit, resetsAt }`.
3. Else increment `message_count` by 1, then run the existing chat pipeline.

Client overlay is UX only. A patched APK cannot bypass the cap.

## Client UI

### Profile

New account option **Fynn Pro** (icon: crown or sparkle, lime-ish bg) between Settings and Privacy Policy → `router.push('/fynn-pro')`.

### `/fynn-pro`

- Header: Fynn Pro
- Current plan card: Monthly / Yearly / Free, expiry date if paid, **Buy** or **Extend**
- Usage: `used / 20` today, short line “Resets at midnight IST”. Hidden or shown as inactive when not subscribed.
- Two plan cards: Monthly ₹99 / 30 days, Yearly ₹999 / 365 days (call out savings vs 12×99)
- History list of `fynn_purchases` with status, amount, dates (paid rows prominent; failed muted)
- Pull to refresh

### Fynn tab overlay

Chat history remains in the tree (readable under blur). Composer disabled.

| State | Overlay |
|-------|---------|
| No active plan | Blur + lock + “Subscribe to chat with Fynn” + button → `/fynn-pro` |
| Active plan, `used >= 20` | Blur + lock + “Daily limit reached (20/20)” + “Resets at midnight IST”. No purchase CTA. |

Use `expo-blur` over the thread; lime primary buttons consistent with the rest of the app.

## Edge functions & secrets

| Function | Auth |
|----------|------|
| `fynn-create-order` | User JWT |
| `fynn-razorpay-webhook` | Razorpay webhook secret (no user JWT) |
| `fynn-chat` | User JWT + entitlement/usage checks (existing function, extended) |

Supabase secrets: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.  
App extra / env: public `RAZORPAY_KEY_ID` only.

Webhook URL: `https://<project>.supabase.co/functions/v1/fynn-razorpay-webhook` registered in Razorpay dashboard for `payment.captured` (and optionally `payment.failed`).

## Native / Expo

- Add `react-native-razorpay` via a development build (Expo 54 config plugin or documented prebuild steps).
- Android only in `app.json` usage; do not call Checkout on iOS in v1 (show “Fynn Pro is available on Android”).
- Expo Go cannot load the native SDK.

## Out of scope

- iOS / Apple IAP
- Auto-renew, UPI mandates, pause/cancel
- Refunds, invoices/GST breakup UI, coupons
- Family plans, message packs, higher caps for yearly
- Unlocking other app features besides Fynn
- Changing the existing bills `subscriptions` feature
