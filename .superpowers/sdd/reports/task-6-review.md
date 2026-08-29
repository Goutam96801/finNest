# Task 6 Review (Re-review after Critical/Important fixes): Transaction proposals + `fynn-confirm` + confirm UI

**Spec: ✅**
**Quality: Approved**

## Verification performed

- Re-ran `deno test --allow-all supabase/functions/fynn-chat/index.test.ts supabase/functions/fynn-confirm/index.test.ts supabase/functions/_shared/tools/apply.test.ts` → **7 passed, 0 failed** (confirms the report's claim independently).
- Re-ran `npx tsc --noEmit --pretty false` → exit 0, no type errors.
- Read `apply.ts`, `proposals.ts`, `fynn-confirm/index.ts`, and the full diff (`task-6-review-pkg.md`, commit `9bac132`) line-by-line against both prior Critical/Important findings.

## Fix verification

1. **Critical #1 (payload key mismatch) — Fixed.** `apply.ts` now has `getTransactionArgs()`, which maps the stored **snake_case** `payload.transaction` (`account_id`, `to_account_id`, `transaction_date`, …) back into the **camelCase** shape (`accountId`, `toAccountId`, `transactionDate`, …) that `buildTransactionPayload` expects, before re-invoking it. Traced the data flow end-to-end:
   - `propose_create_transaction`: `buildTransactionPayload` at creation time always returns a **fully-populated** `TransactionPayload` (no field is ever left undefined — every field has a value or a validated default). `getTransactionArgs` now correctly surfaces `account_id → accountId` etc., so `accountId` resolves to the real value instead of `undefined`, and creation no longer throws `Account is required`. Verified directly by the new `apply.test.ts` regression test, which builds a fully-mocked `userClient`, calls `applyProposal` with a realistic snake_case stored payload, and asserts the exact row passed to `.insert()` — test passes.
   - `propose_update_transaction`: because the stored `transaction` object is already fully resolved (not the original partial args), `getTransactionArgs` now feeds *all* fields back in as defined values, so `buildTransactionPayload`'s `existing` fallback (now sourced from a fresh `getExistingTransaction` re-fetch) is effectively bypassed rather than masking the proposed change. This means the applied update reflects exactly what was shown/confirmed in the preview card, not silently-reverted "current DB" values — the specific masking bug is closed. This path is not directly exercised by a dedicated test (see Minor below), but the fix is the same shared function/mapping already covered by the create-path test, and manual trace confirms correct behavior.
   - Account/destination-account ownership is still re-validated at apply time via `assertAccountOwned`, now against the *correct* (previously-proposed) account IDs rather than accidentally-undefined ones.

2. **Important #1 (TOCTOU race on accept/reject) — Fixed.** `fynn-confirm/index.ts` replaced "check-then-write" with an atomic conditional claim: `claimProposal()` issues a single `UPDATE fynn_proposals SET status=…, resolved_at=… WHERE id=$1 AND user_id=$2 AND status='pending' AND expires_at > now() RETURNING …`. This is one round-trip, so concurrent accept/accept, accept/reject, or reject/reject requests for the same proposal can have at most one succeed (returns the row) while the other(s) get `null` back and are correctly rejected with 404 "already resolved" — verified by the new test `Fynn confirm does not apply a proposal when an atomic claim loses the race`, which stubs `claimProposal` returning `null` and asserts `applyProposal` is never invoked. If `applyProposal` itself throws after a successful claim, `rollbackAcceptedProposal` reverts status to `pending` (guarded by `status='accepted'`) so the proposal remains actionable rather than stuck — this is new, sound behavior not present before.

3. **Minor (global `confirmingProposalId`) — Fixed.** `app/(tabs)/fynn.tsx` now tracks `confirmingProposalIds: string[]`, so only the specific proposal card being accepted/rejected disables its own buttons; other pending proposal cards in the same chat remain interactive.

## Checklist (unchanged items re-confirmed)

| Requirement | Result |
|---|---|
| `apply` reads snake_case payload keys correctly | ✅ Confirmed via code read + passing regression test |
| Claim (accept/reject) is atomic | ✅ Confirmed: single conditional `UPDATE … WHERE status='pending' AND expires_at > now() RETURNING` closes the previously-identified race |
| Regression test covers the mapping bug | ✅ (create path) — see Minor below for update-path test gap |
| `propose_*` never mutates `transactions` directly | ✅ Unchanged from prior pass |
| Apply uses user JWT only | ✅ Unchanged from prior pass |
| Forged `user_id` ignored | ✅ Unchanged from prior pass |
| UI confirm card Accept/Reject, correctly scoped disabling | ✅ Now per-proposal |

## Remaining Critical

None.

## Remaining Important

None.

## Minor

1. The new `apply.test.ts` regression test only covers `propose_create_transaction`. `propose_update_transaction` shares the same fixed `getTransactionArgs`/`buildTransactionPayload` mapping (so the specific bug class is covered indirectly), but the update-only code path — `getTransactionId`, `getExistingTransaction`, and the `.update(...).eq('id', …).eq('user_id', …)` chain — has no direct test. A future regression here (e.g., a bug in `getExistingTransaction`'s ownership filter) wouldn't be caught by the current suite. Consider adding an `applyProposal` test for `propose_update_transaction` (and optionally `propose_delete_transaction`) mirroring the existing create test.
2. `GRANT ALL ON TABLE public.fynn_proposals TO anon, authenticated, service_role;` in `20260808120000_fynn_proposals.sql` still grants broad table privileges to `anon`. Safe today because every RLS policy gates on `auth.uid() = user_id` (unauthenticated `anon` requests have `auth.uid()` = null and match nothing), and this matches the pre-existing convention used by other tables (`transactions`, `categories`) in this codebase — carried over from the prior review as a non-blocking, pre-existing pattern rather than a new issue.
3. Deployment of `fynn-chat`/`fynn-confirm` to the target Supabase project has not been verified (report notes HTTP 403 permission errors and unavailable Docker during the author's attempt). This is an environment/credentials limitation outside the code's control, not a code defect, but the brief's Step 5 smoke test ("Add expense ₹50 for tea on Cash… Accept → row in transactions") has not been run end-to-end against a live deployment. Recommend running it once deploy credentials/Docker are available, since it is the only remaining unverified path or the intended feature.

## Path

`D:/Building/finnest-mob/.superpowers/sdd/reports/task-6-review.md`
