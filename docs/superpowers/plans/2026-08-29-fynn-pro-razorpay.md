# Fynn Pro Razorpay Implementation Plan

> **For agentic workers:** Inline execution in this session. Spec: `docs/superpowers/specs/2026-08-29-fynn-pro-razorpay-design.md`

**Goal:** Gate Fynn behind prepaid Razorpay plans (₹99 / 30 days, ₹999 / 365 days) with 20 messages/day and a Fynn Pro screen.

**Architecture:** Postgres stores purchases + daily usage. `fynn-create-order` makes a Razorpay Order. Native Checkout collects payment. `fynn-razorpay-webhook` (`payment.captured`) is the only unlock. `fynn-chat` calls `consume_fynn_message` before OpenRouter.

**Tech Stack:** Expo 54, `react-native-razorpay` 3.x, `expo-blur`, Supabase Edge (Deno), Razorpay Orders API (not Subscriptions plans, even if plan IDs exist in env).

## Global Constraints

- Android checkout only in v1. Expo Go cannot load the native SDK — need `npx expo run:android`.
- Never put `RAZORPAY_KEY_SECRET` or webhook secret in `EXPO_PUBLIC_*`.
- Do not reuse `public.subscriptions` or `/subscriptions`.
- 20 messages/IST day, both plans. Repeat buy extends `max(now, current period_end)`.
- Webhook grants access; client success is not trusted.

## File map

| Path | Responsibility |
| --- | --- |
| `supabase/migrations/20260829120000_fynn_pro.sql` | Tables + RPCs |
| `supabase/functions/_shared/razorpay.ts` | Order create + HMAC verify |
| `supabase/functions/fynn-create-order/index.ts` | Authenticated order |
| `supabase/functions/fynn-razorpay-webhook/index.ts` | Capture / fail |
| `supabase/functions/fynn-chat/index.ts` | Consume before LLM |
| `supabase/functions/fynn-confirm/index.ts` | Entitlement on accept |
| `lib/services/fynnPro.ts` | Status, history, checkout |
| `context/fynnProContext.tsx` | Shared status |
| `components/ai-support/FynnLockOverlay.tsx` | Blur + lock |
| `app/fynn-pro.tsx` | Plans + history |
| `app/(tabs)/profile.tsx` | Fynn Pro row |
| `app/(tabs)/fynn.tsx` | Overlay + disable composer |
| `supabase/config.toml` | `verify_jwt = false` on webhook |
