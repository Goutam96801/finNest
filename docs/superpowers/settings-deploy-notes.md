# Settings / export deploy notes

## Migrations
```bash
npx supabase db push --yes
```

Includes settings columns, feedback, `data_exports`, private `exports` storage bucket, and Fynn tables:

- `20260808120000_fynn_proposals.sql` — pending mutation proposals (confirm flow)
- `20260808130000_fynn_chats.sql` — chat threads and messages (phase 5 persistence)

If `db push` fails with **remote migration versions not found in local migrations directory**
(`LegacyDbPushMissingLocalError`), repair migration history for the remote versions or run
`supabase db pull` to sync before pushing Fynn migrations. Edge functions that write proposals
or chat rows require these tables on the linked project.

## Edge functions
```bash
npx supabase functions deploy export-transactions
npx supabase functions deploy delete-account
npx supabase functions deploy fynn-chat
npx supabase functions deploy fynn-confirm
```

Export: CSV/PDF → Storage `exports/{userId}/…` (no email).

## Fynn LLM Edge secrets

Configure these secrets only for Supabase Edge Functions. Never expose them through
`EXPO_PUBLIC_*` variables or include them in the mobile application.

```bash
npx supabase secrets set LLM_PROVIDER=gemini LLM_API_KEY=YOUR_KEY LLM_MODEL=gemini-flash-latest
```

- `LLM_PROVIDER`: `gemini` (default)
- `LLM_API_KEY`: Gemini API key, stored only in Supabase Edge Function secrets
- `LLM_MODEL`: optional Gemini model override; defaults to `gemini-flash-latest`. Use a full model id in lowercase (e.g. `gemini-flash-latest`). Avoid bare `gemini`. Note: `gemini-2.5-flash` may 404 on some API keys; `gemini-2.0-flash` may return 429 when free-tier quota is exhausted.
- Device clock skew: if Expo/PostgREST logs `JWT issued at future` (PGRST303), the phone clock is ahead of the server — fix automatic time, sign out/in, then retry Fynn. Fynn may still answer in ephemeral mode, but chats won’t persist until the clock is fixed.

### OpenAI provider swap

No Expo rebuild is needed to swap the Edge Function provider. Set the OpenAI key and
model, then deploy the Fynn functions if the latest code is not already deployed:

```bash
npx supabase secrets set LLM_PROVIDER=openai LLM_API_KEY=YOUR_OPENAI_KEY LLM_MODEL=gpt-4o-mini
npx supabase functions deploy fynn-chat
npx supabase functions deploy fynn-confirm
```

With a logged-in test user, smoke test one read turn (for example, “List my
accounts”) and one confirmed write (for example, propose a small transaction,
tap Accept, and verify the row). Switch back to the Gemini default after the
test:

```bash
npx supabase secrets set LLM_PROVIDER=gemini LLM_API_KEY=YOUR_GEMINI_KEY LLM_MODEL=gemini-flash-latest
```

### Fynn hardening limits

- A chat turn performs at most 6 LLM/tool iterations.
- List tools are capped at 25 records.
- Mutation proposals expire after 10 minutes.
- `fynn-chat` allows 20 valid turns per user per rolling minute. This limiter is
  an in-memory `Map` per Edge isolate, so it is best-effort and does not enforce
  a shared global limit across isolates or deployments. Replace it with a shared
  store before relying on it for abuse prevention at scale.

### Fynn apply atomicity follow-up

Some `applyProposal` handlers use multiple database writes without a shared
transaction. A failure after an earlier write can leave partial state, and
`fynn-confirm` currently returns the proposal to `pending` for retry. Subscription
creation handles its follow-up notification as best-effort so a notification
failure does not trigger a duplicate subscription on retry. Account and other
multi-step applies still need transactional Postgres RPCs or idempotency keys
before retries can be considered safe.

## Fynn Pro (Razorpay)

Migration: `20260829120000_fynn_pro.sql`

```bash
npx supabase db push --yes
npx supabase secrets set RAZORPAY_KEY_ID=... RAZORPAY_KEY_SECRET=... RAZORPAY_WEBHOOK_SECRET=...
npx supabase functions deploy fynn-create-order
npx supabase functions deploy fynn-razorpay-webhook --no-verify-jwt
npx supabase functions deploy fynn-chat
npx supabase functions deploy fynn-confirm
```

Webhook URL (Razorpay dashboard, events `payment.captured`, `payment.failed`, `order.paid`):

`https://<project-ref>.supabase.co/functions/v1/fynn-razorpay-webhook`

Client: `EXPO_PUBLIC_RAZORPAY_KEY_ID` only (test or live key id). Native Checkout needs a development build: `npx expo run:android`. Expo Go cannot open Razorpay.

Stale unpaid checkouts (`fynn_purchases.status = created` older than 30 minutes) are deleted by pg_cron job `cleanup-stale-fynn-purchases` (every 5 minutes). Migration: `20260829140000_cleanup_stale_fynn_purchases.sql`.
