# Nest billing — Razorpay setup guide

Use this after Nest P0 code is deployed. Goal: Settings → **Upgrade to Nest** opens Razorpay pay link; webhook sets `profiles.nest_active`.

**Project webhook URL (this app):**

```
https://orcxobsgslzncmyrctla.supabase.co/functions/v1/razorpay-webhook
```

---

## 0. Prerequisites

- [ ] Razorpay account (Test Mode first)
- [ ] KYC started or complete (needed for Live Mode / UPI Autopay)
- [ ] Supabase CLI logged in (`npx supabase login` / linked to project)
- [ ] Migration + functions already pushed (done if you followed Nest P0)

---

## 1. Razorpay Dashboard — enable Subscriptions

1. Open [Razorpay Dashboard](https://dashboard.razorpay.com/).
2. Stay in **Test Mode** (toggle top-right) until checkout works end-to-end.
3. Go to **Payment Products → Subscriptions**.
4. If prompted, enable **Subscriptions** for the account.

Official overview: [Subscriptions docs](https://razorpay.com/docs/payments/subscriptions/)

---

## 2. Create Nest plans

**Subscriptions → Plans → Create Plan** (do this twice).

### Nest Monthly

| Field | Value |
|-------|--------|
| Plan name | Nest Monthly |
| Description | FinNest Nest — monthly |
| Billing amount | **99** INR |
| Billing frequency | **Monthly** |
| Billing cycle | Every **1** month |

Copy **Plan ID** (`plan_…`) → this becomes `RAZORPAY_PLAN_NEST_MONTHLY`.

### Nest Yearly

| Field | Value |
|-------|--------|
| Plan name | Nest Yearly |
| Description | FinNest Nest — yearly |
| Billing amount | **999** INR |
| Billing frequency | **Yearly** |
| Billing cycle | Every **1** year |

Copy **Plan ID** (`plan_…`) → this becomes `RAZORPAY_PLAN_NEST_YEARLY`.

> Plans are **mode-specific**. Test Mode plans ≠ Live Mode plans. Recreate both when you go live and update secrets.

---

## 3. API keys

1. **Account & Settings → API Keys** (or Developers → API Keys).
2. Generate / view **Key Id** + **Key Secret** for current mode.
3. Key Id looks like `rzp_test_…` (test) or `rzp_live_…` (live).

These become:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`

Never put the secret in the Expo app or `.env.local` client vars — Edge Functions only.

---

## 4. Webhook

1. **Account & Settings → Webhooks → Add New Webhook** (or Developers → Webhooks).
2. **Webhook URL:**

   ```
   https://orcxobsgslzncmyrctla.supabase.co/functions/v1/razorpay-webhook
   ```

3. **Secret:** generate a strong random string (or use Razorpay’s suggested secret). Save it → `RAZORPAY_WEBHOOK_SECRET`.
4. Enable at least these events (or all `subscription.*`):

   | Event | Why |
   |-------|-----|
   | `subscription.activated` | Nest unlocks |
   | `subscription.authenticated` | Auth / mandate done |
   | `subscription.charged` | Renew / renews_at update |
   | `subscription.pending` | Status snapshot |
   | `subscription.halted` | Payment failures |
   | `subscription.cancelled` | Nest revoke |
   | `subscription.completed` | Nest revoke |
   | `subscription.updated` | Status / dates |

5. Save. Confirm the webhook shows as **Active**.

Our function verifies header `x-razorpay-signature` with HMAC-SHA256 of the raw body using `RAZORPAY_WEBHOOK_SECRET`.

---

## 5. Set Supabase Edge secrets

From the repo root (PowerShell):

```powershell
npx supabase secrets set RAZORPAY_KEY_ID=rzp_test_xxxxx
npx supabase secrets set RAZORPAY_KEY_SECRET=xxxxx
npx supabase secrets set RAZORPAY_WEBHOOK_SECRET=xxxxx
npx supabase secrets set RAZORPAY_PLAN_NEST_MONTHLY=plan_xxxxx
npx supabase secrets set RAZORPAY_PLAN_NEST_YEARLY=plan_xxxxx
```

Confirm:

```powershell
npx supabase secrets list
```

You should see all five names (values are hidden).

> If functions were deployed **before** secrets, no redeploy is required — secrets apply to existing functions. Redeploy only after code changes.

---

## 6. Redeploy functions (only if needed)

Already done once. Re-run after editing function code:

```powershell
npx supabase functions deploy create-nest-checkout
npx supabase functions deploy create-nest-portal
npx supabase functions deploy razorpay-webhook
```

`config.toml` keeps `razorpay-webhook` with `verify_jwt = false` (Razorpay cannot send a Supabase JWT). Checkout/portal still require the user’s auth JWT from the app.

---

## 7. Test the full flow

1. Run the app signed in.
2. **Settings → Upgrade to Nest → Monthly (₹99)** (or Yearly).
3. In-app browser opens Razorpay subscription `short_url`.
4. Pay with Test Mode methods (Razorpay test cards / UPI test flows for your account).
5. Return to the app (close browser / switch back). Nest status refreshes on AppState active.
6. Confirm:
   - Settings shows **Manage Nest** / renew date
   - Profile / footer shows **FinNest** + Nest badge
   - In Supabase Table Editor → `profiles` for your user: `nest_active = true`, `razorpay_subscription_id` set
7. Razorpay Dashboard → **Subscriptions** → subscription **active** / **authenticated**
8. Webhooks → delivery log → `200` on `subscription.*`

### Cancel path

**Manage Nest → Cancel Nest** → Razorpay `cancel_at_cycle_end`. Access stays until period end; then webhook clears `nest_active`.

---

## 8. Go Live checklist

- [ ] Complete Razorpay KYC
- [ ] Switch Dashboard to **Live Mode**
- [ ] Recreate **Monthly** + **Yearly** plans; copy new Plan IDs
- [ ] New Live API keys → update secrets (`rzp_live_…`)
- [ ] New Live webhook (same URL is fine) + new webhook secret → update `RAZORPAY_WEBHOOK_SECRET`
- [ ] One real ₹99 test on a personal account, then cancel if needed
- [ ] Update Privacy Policy / Nest copy for Razorpay billing

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| “Razorpay is not configured” | Secrets missing / typo; `secrets list`; Key Id + both Plan IDs set |
| Checkout opens but Nest never unlocks | Webhook URL, secret match, events enabled; function logs for `razorpay-webhook` |
| Signature errors in logs | Webhook secret in Dashboard ≠ `RAZORPAY_WEBHOOK_SECRET` |
| Wrong plan amount | Using Test plan IDs with Live keys (or vice versa) |
| `nest_active` stays false | Subscription status not `active`/`authenticated`; inspect webhook payload `status` |
| **Hosted page is not available** (app link) but Dashboard link works | App must create subscription **without** `customer_id` (Dashboard style). Redeploy `create-nest-checkout`. Old `Created` rows with a Customer Id can be ignored/cancelled. |

Function logs:

```powershell
npx supabase functions logs razorpay-webhook --project-ref orcxobsgslzncmyrctla
npx supabase functions logs create-nest-checkout --project-ref orcxobsgslzncmyrctla
```

---

## Env reference

| Secret | Source |
|--------|--------|
| `RAZORPAY_KEY_ID` | API Keys → Key Id |
| `RAZORPAY_KEY_SECRET` | API Keys → Key Secret |
| `RAZORPAY_WEBHOOK_SECRET` | Webhooks → Secret |
| `RAZORPAY_PLAN_NEST_MONTHLY` | Plans → Nest Monthly Plan ID |
| `RAZORPAY_PLAN_NEST_YEARLY` | Plans → Nest Yearly Plan ID |

Related: [Nest P0 plan](./2026-08-04-nest-billing-p0.md) · [Nest design spec](../specs/2026-08-04-nest-paid-tier-design.md)
