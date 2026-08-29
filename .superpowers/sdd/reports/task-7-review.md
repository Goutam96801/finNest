# Task 7 Re-review: Remaining Fynn entity proposals

## Verdict

- **Spec:** ❌
- **Quality:** Good. Both P1 fixes correctly follow the existing app behavior; required full entity accept/reject and forged-ID coverage remains absent.
- **Path reviewed:** `9bac132c37caaf6abea37507032ee5514332af1a..94065ec4bbe21ac873155d09289ffce47abf6fe4`

## Critical / Important

No remaining P1 findings.

## Verified P1 fixes

- `propose_update_profile` updates `profiles.full_name` and, when supplied, calls the authenticated client's `auth.updateUser({ data: { display_name } })` in `supabase/functions/_shared/tools/apply.ts:237-251`. This matches `lib/services/profile.ts` and keeps the profile and greeting metadata aligned.
- Subscription creation inserts the same `subscription_due` “reminder set” notification as the client service and returns `reminderResyncRequired: true`; subscription updates return the same resync flag in `supabase/functions/_shared/tools/apply.ts:186-224`.
- `fynn-confirm` returns the apply result under `data`, and `app/(tabs)/fynn.tsx:160-169` detects that flag after a successful acceptance, gets the authenticated user, and calls `resyncSubscriptionRemindersForUser(user.id)`. The response shape therefore reaches the client correctly.

## Minor

### [P3] Required entity accept/reject and forged-ID coverage is still missing

- **Path:** `supabase/functions/_shared/tools/apply.test.ts:1-294`

The brief requires one accept and one reject smoke test for every entity group, including a forged foreign-user UUID. The new tests cover the two P1 regressions, plus account creation and payload transport, but do not exercise all entity groups, rejection flows, or foreign-user IDs. The report also confirms that live RLS smoke tests were not run.

## Verification

- `npx deno test supabase/functions/_shared/tools/apply.test.ts supabase/functions/fynn-confirm/index.test.ts` — 8 passed.
- `npx tsc --noEmit --pretty false` — passed.
- `git diff --check 9bac132c37caaf6abea37507032ee5514332af1a 94065ec4bbe21ac873155d09289ffce47abf6fe4` — passed.
