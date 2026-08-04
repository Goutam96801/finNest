# Nest P0 — Billing implementation plan (Razorpay)

**Date:** 2026-08-04  
**Spec:** [2026-08-04-nest-paid-tier-design.md](../specs/2026-08-04-nest-paid-tier-design.md)  
**Scope:** Razorpay Subscriptions from Settings (₹99/mo, ₹999/yr), webhook → `profiles.nest_active`, Fin/FinNest badge.

## Approach

- In-app purchase via **Razorpay Subscription** `short_url` (`expo-web-browser`).
- Entitlement: `profiles.nest_active` updated by `razorpay-webhook`.
- Manage: cancel at cycle end via API (no hosted portal).

## Files

| File | Role |
|------|------|
| `supabase/migrations/20260804130000_nest_razorpay.sql` | Razorpay customer/subscription ids |
| `supabase/functions/create-nest-checkout/` | Create customer + subscription |
| `supabase/functions/create-nest-portal/` | Cancel / resume at cycle end |
| `supabase/functions/razorpay-webhook/` | Sync nest_active from subscription events |
| `lib/services/nest.ts` | Client checkout + cancel |
| Settings Nest section | Upgrade / Manage UI |

## Env (Edge secrets)

`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_PLAN_NEST_MONTHLY`, `RAZORPAY_PLAN_NEST_YEARLY`

**Setup guide:** [2026-08-04-nest-razorpay-setup.md](./2026-08-04-nest-razorpay-setup.md)
