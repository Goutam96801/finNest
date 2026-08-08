# Task 9 Review: OpenAI provider + hardening

## Verdict

- **Spec:** ✅
- **Quality:** Solid adapter and factory wiring with focused tests; hardening caps are documented and mostly pre-existing; rate limiting is a documented best-effort v1. No live provider smoke was run in this environment.
- **Path reviewed:** `2928c44a984f66e6c6bff948aef6b86312c83448..9fed4d94c5758f67c9a285fcdf340a749afb9b7a`

## Spec checklist

| Requirement | Result |
|---|---|
| OpenAI-compatible adapter behind `LLM_PROVIDER=openai` | ✅ `supabase/functions/_shared/llm/openai.ts` maps messages/tools, parses function arguments, synthesizes missing tool-call IDs, and omits `tools` when empty. |
| Factory env swap; Gemini remains default | ✅ `getLlmProvider()` in `provider.ts` accepts `gemini` \| `openai`, default `gemini` + `gemini-2.0-flash`; OpenAI default model `gpt-4o-mini`. |
| Env-only smoke (read + confirmed write); restore Gemini | ✅ Documented in `docs/superpowers/settings-deploy-notes.md` with secrets, deploy, smoke steps, and restore commands. Not executed live (no secrets in workspace). |
| Caps: 6 iterations, list 25, proposal TTL 10m, per-user rate limit | ✅ `MAX_TOOL_ITERATIONS = 6` in `fynn-chat/index.ts`; `maximum: 25` in `catalog.ts` and `MAX_LIST_ROWS = 25` in `reads.ts`; `expires_at` +10m in `proposals.ts`; new 20/min in-memory limiter + deploy doc caveat. |
| Commit `feat: add env-swappable LLM providers and Fynn hardening` | ✅ `9fed4d9` per report and review package. |
| No API key leaks | ✅ Keys only via `Authorization: Bearer` header; transport errors redacted; HTTP failures surface status only (no response body). No `EXPO_PUBLIC_*` or app-bundle references. |

## Critical

None.

## Important

### [P2] Live OpenAI env swap not verified end-to-end

- **Path:** `.superpowers/sdd/reports/task-9-report.md` (Tests / Concerns), `docs/superpowers/settings-deploy-notes.md`

The brief requires one authenticated read turn and one confirmed write after setting `LLM_PROVIDER=openai`. Implementation and deploy notes match that flow, but no live smoke ran against OpenAI or deployed Edge Functions in this workspace. Run the documented secrets + deploy + read/proposal/confirm sequence before treating the second provider as production-ready.

### [P2] Per-isolate rate limit is intentional but weak for abuse

- **Path:** `supabase/functions/fynn-chat/index.ts:9-24`, `docs/superpowers/settings-deploy-notes.md:58-61`

The new limiter is correct for v1 and tested (429 after 20 successful turns), but the module-level `Map` is not shared across Edge isolates or cold starts. Deploy notes call this out; treat it as documented residual risk, not a code defect, until a shared store exists.

## Minor

### [P3] OpenAI provider missing non-OK HTTP parity test

- **Path:** `supabase/functions/_shared/llm/openai.test.ts`, `supabase/functions/_shared/llm/gemini.test.ts:123-137`

Gemini asserts that a 401 response throws a status-only message without echoing the key. OpenAI implements the same pattern in `openai.ts:88-89` but has no equivalent test; adding one would lock in redaction behavior.

### [P3] Rate limiter state is module-global

- **Path:** `supabase/functions/fynn-chat/index.ts:11-24`

Timestamps are pruned per user on access, but user keys are never removed from `requestTimesByUser`, and state persists for the life of the isolate (and can carry across Deno tests). Acceptable for v1; consider injectable limiter or periodic cleanup if tests flake.

### [P3] Invalid POST bodies skip rate limiting

- **Path:** `supabase/functions/fynn-chat/index.ts:166-170`

Validation for empty `message` returns 400 before `isRateLimited`. Aligns with “valid turns” wording in deploy notes; authenticated clients could still spam cheap 400s without hitting the 20/min cap.

### [P3] LLM failures returned to clients as HTTP 400

- **Path:** `supabase/functions/fynn-chat/index.ts:264-268`

Provider errors (e.g. `OpenAI request failed with status 401`) are exposed as 400 JSON messages. No key material, but status semantics are closer to 502/503; pre-existing handler pattern, unchanged scope beyond new provider strings.

## Verification

- `npx --yes deno test --allow-all supabase/functions` — 21 passed, 0 failed (re-run during review).
- Line-by-line review of `openai.ts`, `provider.ts`, `fynn-chat/index.ts`, deploy notes, and `task-9-review-pkg.md`.

## Path

`D:/Building/finnest-mob/.superpowers/sdd/reports/task-9-review.md`
