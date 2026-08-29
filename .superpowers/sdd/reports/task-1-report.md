# Task 1 Report — Migration `fynn_proposals`

**Task:** Migration — `fynn_proposals`  
**Branch:** `feat/fynn-llm-tools`  
**Date:** 2026-08-08  
**Brief:** `.superpowers/sdd/briefs/task-1-brief.md`  
**Spec:** `docs/superpowers/specs/2026-08-08-fynn-llm-tools-design.md`

## Status

**DONE_WITH_CONCERNS** — Migration file created and committed; `npx supabase db push` failed due to remote/local migration history drift (CLI is linked).

## Deliverables

| Item | Result |
|------|--------|
| `supabase/migrations/20260808120000_fynn_proposals.sql` | Created verbatim per brief |
| Git commit (migration only) | `ee4719f` |
| Unrelated dirty files | Not staged or committed |

## Migration contents

- **Table:** `public.fynn_proposals` with columns `id`, `user_id` → `public.profiles(id)` ON DELETE CASCADE, `tool_name`, `payload` (jsonb), `summary`, `status` (CHECK: pending/accepted/rejected/expired), `expires_at`, `created_at`, `resolved_at`.
- **Index:** `fynn_proposals_user_status_idx` on `(user_id, status, expires_at DESC)`.
- **RLS:** Enabled; SELECT, INSERT, UPDATE policies scoped to `auth.uid() = user_id`.
- **Grants:** `ALL` on table to `anon`, `authenticated`, `service_role` (matches existing migration patterns in this repo).

## Apply migration (`db push`)

**Command:** `npx supabase db push`  
**Outcome:** Failed (exit code 1).

**Error:**

```
Remote migration versions not found in local migrations directory.
LegacyDbPushMissingLocalError
```

**CLI suggestion (not run):** Repair migration history for remote versions `20260804120000`, `20260804130000`, or run `supabase db pull` to sync local with remote.

**Interpretation:** Supabase CLI connected to a remote database, but remote has migration version(s) not present in this workspace’s `supabase/migrations/`. This task did not repair history or pull schema; only the new migration file was added.

**Next step for operator:** Resolve migration history sync, then re-run `npx supabase db push` (or apply `20260808120000_fynn_proposals.sql` via your usual deploy path).

## Commit

```
ee4719f feat: add fynn_proposals table for confirmed LLM mutations
```

Files in commit:

- `supabase/migrations/20260808120000_fynn_proposals.sql` (+33 lines)

## Verification (local)

- [x] SQL matches task brief exactly
- [x] `user_id` references existing `public.profiles(id)` (consistent with other migrations)
- [x] RLS policies for own rows only (SELECT, INSERT, UPDATE)
- [ ] Remote apply confirmed — blocked by migration history mismatch

## Concerns / notes

1. **`db push` blocked** — Remote/local migration versions out of sync; table not verified on linked project until history is repaired or migrations are aligned.
2. **No DELETE policy** — As specified in brief; Edge Functions using `service_role` can still manage rows; clients cannot DELETE via RLS (may be intentional for audit trail).
3. **Future Edge Function inserts** — Service role bypasses RLS; client JWT paths must set `user_id` to `auth.uid()` on INSERT per policy.

## Test summary

Migration SQL committed; `npx supabase db push` failed (remote migration versions missing locally).
