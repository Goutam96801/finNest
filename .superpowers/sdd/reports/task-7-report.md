# Task 7 Report: Remaining Fynn entity proposals

## Status

DONE_WITH_CONCERNS

## Delivered

- Added Fynn catalog and executor support for account, subscription, profile, and notification proposal tools.
- Proposal handlers validate owned account/subscription/notification records, persist only pending `fynn_proposals` rows, and use snake_case payloads.
- Apply handlers use the authenticated user client and scope every mutation to its authenticated user. Payload `user_id` values are ignored.
- Account deletion follows the app's existing soft-archive behavior and maintains a primary account when a replacement exists. Profile updates accept only the approved safe fields.
- Added focused Deno coverage proving an account proposal stores a snake_case payload consumed by apply.

## Verification

- `npx deno test supabase/functions/fynn-chat/index.test.ts supabase/functions/fynn-confirm/index.test.ts supabase/functions/_shared/tools/apply.test.ts` — 9 passed.
- `npx tsc --noEmit --pretty false` — passed.
- `npx expo lint` — passed with 23 pre-existing warnings and no errors.
- `git diff --check` — passed.

## Concerns

- RLS ownership was enforced in code and existing policies were inspected, but live-database smoke tests for each entity group (including a forged UUID) were not run because no local Supabase database was available in this workspace.
- The added automated mapping coverage focuses on accounts; the remaining entity handlers share the same authenticated-client and ownership-filter pattern but have not yet received per-entity integration tests.

## Fix

- `propose_update_profile` now mirrors an accepted `full_name` change to authenticated-user `display_name` metadata.
- Subscription creates now insert the same `subscription_due` reminder-set notification as the client service. Subscription creates and updates return `reminderResyncRequired: true`; Fynn forwards this apply result and the mobile UI dynamically invokes `resyncSubscriptionRemindersForUser` after an accepted apply.
- Added focused Deno regression coverage for profile metadata mirroring and subscription notification/resync output.

## Fix Verification

- `npx deno test supabase/functions/_shared/tools/apply.test.ts supabase/functions/fynn-confirm/index.test.ts` — 8 passed.
- `npx tsc --noEmit --pretty false` — passed.
- `npx expo lint` — passed with 23 pre-existing warnings and no errors.
