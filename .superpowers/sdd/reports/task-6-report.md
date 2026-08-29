# Task 6 Report: Fynn transaction proposals and confirmation

## Status

DONE_WITH_CONCERNS

## Delivered

- Added transaction proposal tools for create, update, and delete. They validate transaction values and owned accounts, then create a pending `fynn_proposals` row with a ten-minute expiry; no transaction mutation occurs during proposal creation.
- Added `fynn-confirm`, which uses the authenticated request client, ignores client-provided user identity, expires stale proposals, rejects without mutation, and applies accepted transaction proposals through the user JWT client.
- Added proposal responses to `fynn-chat`, the `confirmFynnProposal` client API, and Accept / Reject cards in the Fynn UI.

## Verification

- `npx deno test supabase/functions/fynn-chat/index.test.ts supabase/functions/fynn-confirm/index.test.ts` — 5 passed.
- `npx tsc --noEmit --pretty false` — passed.
- `npx expo lint` — passed with 23 existing workspace warnings and no errors.
- `git diff --check` — passed.

## Concerns

- Deployments for `fynn-chat` and `fynn-confirm` both failed before upload with Supabase HTTP 403: the configured account lacks privileges to list/deploy functions. Docker was also unavailable.
- The `fynn_proposals` migration must be applied to the target database before either function can persist or resolve proposals.

## Fixes

- `applyProposal` now maps the stored snake_case transaction payload (`account_id`, `to_account_id`, `transaction_date`, and related fields) back to the validated transaction input shape. The added integration-style Deno test captures the `transactions` insert and verifies the full row created from a snake_case proposal payload.
- `fynn-confirm` now atomically claims an accept or reject with `id`, `user_id`, `status = pending`, and unexpired conditions before applying. A failed apply rolls an accepted claim back to pending; a lost claim returns without applying.
- Confirmation state in the Fynn UI is now tracked per proposal ID, so one proposal’s in-flight request does not disable other proposal cards.

### Verification

- `npx deno test supabase/functions/fynn-chat/index.test.ts supabase/functions/fynn-confirm/index.test.ts supabase/functions/_shared/tools/apply.test.ts` — 7 passed, 0 failed.
- `npx tsc --noEmit --pretty false` — exit 0.
- `npx expo lint` — exit 0; 23 existing workspace warnings, no errors.
- `git diff --check` — exit 0.
