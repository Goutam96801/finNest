# Final Whole-Branch Review — Fynn LLM Tool Agent

**Branch:** `feat/fynn-llm-tools`
**Base:** `8092ab9684feeb5f5d7d674c1340e8e9e412586f`
**Head:** `b8e02f422fb108f15459519aef79cb15cca5d561`
**Commits reviewed:** 14 (verified `git log` matches package manifest exactly)
**Spec:** `docs/superpowers/specs/2026-08-08-fynn-llm-tools-design.md`
**Plan:** `docs/superpowers/plans/2026-08-08-fynn-llm-tools.md`
**Reviewer:** Senior Code Review (read-only; checkout not mutated)

## Scope covered

`git diff --stat` (32 files, +3954/-4) inspected in full for:

- `supabase/functions/_shared/{auth,cors}.ts`
- `supabase/functions/_shared/llm/{types,provider,gemini,openai}.ts` (+ their `.test.ts`)
- `supabase/functions/_shared/tools/{catalog,executor,reads,proposals,apply,validate}.ts` (+ `apply.test.ts`)
- `supabase/functions/fynn-chat/index.ts` (+ `.test.ts`)
- `supabase/functions/fynn-confirm/index.ts` (+ `.test.ts`)
- `supabase/migrations/20260808120000_fynn_proposals.sql`, `20260808130000_fynn_chats.sql`
- `lib/services/fynn.ts`
- `app/(tabs)/fynn.tsx`, `app/(tabs)/_layout.tsx`, `components/CustomTabs.tsx`
- `docs/superpowers/settings-deploy-notes.md`, spec closeout diff

Deno was not available in this environment, so the `*.test.ts` suites were read and reasoned about but **not executed**; correctness is assessed from static reading, not a green test run.

---

## Strengths

- **Auth/RLS discipline is consistent and correct.** Every tool read/write and both Edge handlers use the user-JWT-scoped `userClient` from `getAuthedUserClient` — no service-role client appears anywhere in the new code. All new tables (`fynn_proposals`, `fynn_chats`, `fynn_messages`) have RLS restricted to `auth.uid() = user_id` for every verb, and domain mutations in `apply.ts` re-filter with `.eq('user_id', userId)` as defense-in-depth on top of RLS, exactly as the spec demands.
- **Confirm gate is real, not cosmetic.** Every `propose_*` tool only inserts a row into `fynn_proposals`; `applyProposal` is only reachable from `fynn-confirm`, never from the chat/tool loop. `fynn-confirm`'s "confirm/reject is not an LLM tool" design decision is honored — the LLM cannot self-approve.
- **Atomic claim prevents double-apply / TOCTOU.** `claimProposal` does a single conditional `UPDATE ... WHERE status='pending' AND expires_at > now() ... RETURNING`, so two concurrent accepts (or a reject racing an accept) can't both succeed, and there is a `rollbackAcceptedProposal` path if `applyProposal` throws after the claim (`supabase/functions/fynn-confirm/index.ts:133-145`). This is well beyond a naive "select then update" implementation and is covered by a dedicated race test.
- **Provider adapters keep secrets server-side and don't leak them on failure.** `gemini.ts`/`openai.ts` wrap `fetch` in try/catch and throw generic "transport error" / `status ${response.status}` messages — the API key is never included in any thrown error, log, or client response. Confirmed no `LLM_API_KEY`/`LLM_PROVIDER` references anywhere in `app/`, `lib/`, `.env.example`, or any `EXPO_PUBLIC_*` surface.
- **Defense against forged/invented IDs is structural, not just a convention.** Every propose/apply path either re-verifies ownership via `assertAccountOwned`/`getOwnedRow`/`getExistingAccount` before touching a row, or relies on the `.eq('id', X).eq('user_id', userId)` + RLS combination. The `fynn_chats`/`fynn_messages` composite FK `(chat_id, user_id) → fynn_chats(id, user_id)` is a nice extra integrity control that prevents a message row from ever referencing a chat owned by a different user, even at the DB level.
- **Account balance can't be clobbered by a stale proposal.** `apply.ts`'s `propose_update_account` handler explicitly destructures out `balance` (`const { balance: _ignoredBalance, ...update } = account`) before writing, honoring the catalog's own comment that "Account balances are managed by transactions."
- **Rate limiting, iteration caps, and list caps all match the plan's stated numbers** (6 tool iterations, 25 row cap, 10-minute proposal TTL, 20 req/min/user) and are exercised by tests (`fynn-chat/index.test.ts`'s 6-iteration and 20-turn tests).
- **Honest, unusually transparent doc closeout.** The spec's "Operator blockers" section candidly documents that migrations haven't been pushed, Edge deploy returned 403, and no live LLM smoke has been run — this is exactly the kind of disclosure a reviewer wants to see rather than a false "done" claim.
- **Reasonable unit-test coverage** exists for the trickiest logic (Gemini/OpenAI message mapping, provider factory precedence, chat iteration/rate-limit/proposal-return behavior, confirm's claim/rollback/expiry paths, apply.ts snake_case payload handling).

## Critical

None found. No service-role usage for tool CRUD, no unauthenticated write path, no LLM secret leakage into the client bundle or into error responses, and no RLS gap in the new tables.

## Important

1. **Multi-step `applyProposal` handlers are not transactional; a partial failure can produce duplicate side effects on retry.** `propose_create_subscription` (`supabase/functions/_shared/tools/apply.ts:186-209`) inserts the `subscriptions` row, then inserts a `notifications` row; if the second insert throws, `fynn-confirm` rolls the proposal back to `pending` (`fynn-confirm/index.ts:136-142`) but does **not** undo the already-inserted subscription. A user (or client) retry of Accept on the same `proposal_id` re-runs `applyProposal` from scratch and creates a **second** subscription row. The same non-atomic pattern exists in `propose_create_account`/`propose_update_account` (clear-other-primary-flags, then insert/update — if the second step throws, the account previously flagged primary is left with no replacement) and `propose_delete_account` (archive, then reassign a new primary — if the reassignment step throws, the user is left with zero primary accounts until another action fixes it). None of these is a security bypass, but they are real data-integrity bugs reachable by a plain transient DB error + a user retry. Recommend either (a) wrapping each multi-step apply in a single Postgres function invoked via RPC so it's atomic, or (b) making the handlers idempotent (e.g., check-then-skip using `payload` + a dedupe key) before relying on retries.
2. **Auth failures return HTTP 400 instead of 401.** Both `fynn-chat` and `fynn-confirm` funnel every thrown error — including `getAuthedUserClient`'s "Missing authorization" / "Unauthorized" — through one top-level `catch` that always returns `400` (`fynn-chat/index.ts:264-268`, `fynn-confirm/index.ts:144-148`). The spec explicitly calls for `401` and asks to "align HTTP status with `delete-account` 401." The request still fails closed (no data returned, no mutation applied), so this is not an authorization bypass, but it is a spec deviation that could confuse API consumers/monitoring that key off status codes, and was already flagged as a carryover minor in the review package — it remains unresolved in the head commit.
3. **Zero observability was actually implemented, despite being a named spec requirement.** The spec's "Observability & ops" section calls for "structured Edge logs: `user_id` hash or id, tool name, latency, provider, error code." There is no `console.log`/`console.error`/any logging in `fynn-chat/index.ts` or `fynn-confirm/index.ts` (unlike `delete-account`/`export-transactions`, which both log caught errors). Today, a production failure in the tool loop or LLM call is silently swallowed into a generic `400 { error: ... }` response with nothing in Supabase function logs to debug from. This is a production-readiness gap, not a security one (and arguably reduces PII/secret-leak risk by omission), but it should be closed before relying on this in production.
4. **Operator/deployment blockers are real and unresolved**, per the branch's own spec closeout: migration history drift blocks `npx supabase db push` for both new tables, a prior Edge deploy attempt returned `403`, and **no live LLM smoke test (Gemini or OpenAI) has been run** against a deployed function. This means the "Success criteria" in the spec (DB-backed answers, confirm-card writes, provider swap, 401 on unauth) are verified only by mocked unit tests, not by an end-to-end run against real Supabase + a real LLM. This is the single biggest gap between "code complete" and "production ready."

## Minor

1. **`list_transactions`'s `accountId` filter is interpolated unsanitized into a PostgREST `.or()` string** (`supabase/functions/_shared/tools/reads.ts:76-77`), unlike the adjacent `search` parameter which is regex-stripped first (`reads.ts:84-85`). Because the base query already has `.eq('user_id', userId)` (ANDed) and RLS is also in force, this cannot leak cross-user data, but a crafted `accountId` string containing PostgREST filter syntax could cause a malformed-filter error. Apply the same sanitization/UUID-shape check used for `search`.
2. **`fynn-chat`'s `requireChat`/`listMessages` skip the app-level `.eq('user_id', userId)` filter that every other read/write in this branch uses**, relying solely on RLS to reject another user's `chat_id` (`fynn-chat/index.ts:75-94`). RLS does correctly cover this (verified in the migration), so it is not exploitable, but it's an inconsistency versus the "RLS **plus** defense-in-depth filters" principle applied everywhere else in the branch.
3. **`list_notifications` has no unread filter**, even though the spec's tool catalog explicitly lists "Recent notifications + unread filter" (`catalog.ts:60-67` only exposes `limit`). Not a blocker — `propose_mark_notification_read` still works — but it's a small gap versus the documented tool catalog.
4. **Generic "Transaction confirmed and applied." confirmation text** in `app/(tabs)/fynn.tsx:224-227` fires for every accepted proposal type (account, subscription, profile, notification — not just transactions), which will read oddly for non-transaction confirmations.
5. **In-memory rate limiter and tool-iteration state are per-isolate**, explicitly documented as a known limitation in the deploy notes ("best-effort... does not enforce a shared global limit"). Acceptable for v1 per the plan, but worth a tracked follow-up before scaling past a single warm isolate.
6. **Per-entity "forged another user's UUID" live smoke tests were not run** (carried over from task reviews). The code has structural, layered protection against this (ownership checks + RLS), so this is a verification gap rather than a code defect, but it should be exercised live before go-live given it's explicitly called out as a Task 7 acceptance step in the plan.

---

## Plan completeness check (Tasks 1–10)

| Task | Status | Notes |
| --- | --- | --- |
| 1. `fynn_proposals` migration | ✅ Done | Matches plan schema/RLS exactly. |
| 2. Shared auth + CORS | ✅ Done | Matches plan; see Important #2 for status-code deviation. |
| 3. Gemini provider | ✅ Done | Fully implemented (no `throw new Error('Implement...')` placeholder), plus redaction fix commit `63f6c4e`. |
| 4. Read tools + catalog | ✅ Done | All 6 read tools present, capped at 25 rows, `.eq('user_id', ...)` everywhere. |
| 5. `fynn-chat` read-only turns | ✅ Done | |
| 6. Propose tools + `fynn-confirm` + confirm UI | ✅ Done | Atomic claim + rollback is stronger than the plan's minimal spec. |
| 7. Remaining entity propose/apply tools | ✅ Done | All 8 entity groups from the catalog table are implemented; see Important #1 for non-atomicity risk. |
| 8. Chat persistence | ✅ Done | `fynn_chats`/`fynn_messages` with RLS + composite FK; client loads from Supabase. |
| 9. Hardening + OpenAI swap | ✅ Done (code) | Env-only swap implemented and unit-tested; **live env-swap smoke not run** (Important #4). |
| 10. Spec/docs closeout | ✅ Done | Status updated, checklist added, blockers honestly disclosed. |

No task is silently skipped or stubbed. The gap is entirely between "implemented and unit-tested" and "verified live against a deployed Edge Function + real LLM + pushed migrations," which the branch's own docs already flag.

---

## Merge readiness: **Conditional yes**

The code itself is in good shape: the security model (JWT-scoped clients, RLS everywhere, confirm-gated writes, no service-role CRUD, no secret leakage) is sound and consistently applied across all 14 commits, and the plan's task list is fully implemented with reasonable unit-test coverage. I found no Critical issues.

Recommend merging the branch **once these are addressed or explicitly accepted**:

- Must fix before relying on this in production (not necessarily before merging the PR itself, but before flipping it live for users):
  - Resolve the migration-history drift and push `20260808120000_fynn_proposals.sql` + `20260808130000_fynn_chats.sql` to the linked project.
  - Get Edge deploy permissions sorted and deploy `fynn-chat` + `fynn-confirm`.
  - Set `LLM_PROVIDER`/`LLM_API_KEY`/`LLM_MODEL` secrets and run the documented smoke checklist (one read turn, one confirmed write, Gemini default, and at least one OpenAI env-swap) end-to-end against the real deployment — this is the only way to validate the spec's stated success criteria for real rather than via mocks.
  - Add minimal structured logging (`user_id`, tool name, latency, provider, error code — no secrets/PII) to `fynn-chat`/`fynn-confirm` so production failures are debuggable (Important #3).
- Should fix soon after (not launch-blocking given low likelihood/impact, but real bugs):
  - Make the multi-step `apply.ts` handlers (subscription create, account create/update/delete) atomic or idempotent so a transient partial failure + retry can't create duplicate/inconsistent rows (Important #1).
  - Align auth failure responses to `401` per spec (Important #2).
- Nice-to-have cleanup (Minor items 1–6 above) can be tracked as follow-up tickets and are not blocking.

**Path:** `D:/Building/finnest-mob/.superpowers/sdd/reports/final-branch-review.md`

## Fixes applied

- `fynn-chat` and `fynn-confirm` now return HTTP `401` for missing or invalid
  authentication, while preserving their existing `400` handling for non-auth
  request failures.
- Both handlers emit metadata-only structured logs with the authenticated user
  id when available, tool name(s), elapsed milliseconds, provider (or `null` for
  confirm), and a stable error code. Request text, tool arguments, proposal
  payloads, and secrets are not logged.
- `list_transactions` ignores `accountId` values that do not match UUID shape,
  preventing PostgREST filter-string injection through that parameter.
- Subscription notification creation is best-effort after the subscription row
  exists; notification failure is logged without rolling the proposal back and
  making a retry create a duplicate subscription.
- Multi-step proposal applies remain non-transactional. The implementation and
  deploy notes now document the partial-side-effect/retry risk and track
  transactional RPCs or idempotency as the required follow-up.

No migration push, Edge deployment, or live LLM smoke test was performed by
this fix wave.
