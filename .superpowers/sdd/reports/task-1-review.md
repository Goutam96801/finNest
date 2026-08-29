# Task 1 Review — Migration `fynn_proposals`

**Reviewer:** Task-scoped gate (read-only)  
**Base:** `8092ab9684feeb5f5d7d674c1340e8e9e412586f`  
**Head:** `ee4719f820c1664360544e248810ba619339faf2`  
**Brief:** `.superpowers/sdd/briefs/task-1-brief.md`  
**Diff source:** `.superpowers/sdd/reviews/task-1-review-pkg.md`

## Summary

| Gate | Result |
|------|--------|
| **Spec compliance** | ✅ |
| **Task quality** | **Approved** |

---

## Spec compliance

### Verified against diff (do not trust report alone)

| Requirement | Verdict | Evidence |
|-------------|---------|----------|
| Single new file `supabase/migrations/20260808120000_fynn_proposals.sql` | ✅ | Stat: 1 file, +33 lines |
| Table `public.fynn_proposals` with brief columns, FK, CHECK, defaults | ✅ | Diff lines 22–34 match brief |
| Index `fynn_proposals_user_status_idx` on `(user_id, status, expires_at DESC)` | ✅ | Diff lines 36–37 |
| RLS enabled; own-row SELECT / INSERT / UPDATE via `auth.uid() = user_id` | ✅ | Diff lines 39–52 |
| `GRANT ALL` to `anon`, `authenticated`, `service_role` | ✅ | Diff line 54 |
| Commit contains **only** the migration file | ✅ | Single commit, single path in stat |
| Global: RLS own rows | ✅ | All three policies use `auth.uid() = user_id` |
| Global: `fynn_proposals` for pending confirmed LLM mutations | ✅ | Schema + status enum align with design spec |

**SQL vs brief:** The committed migration is **byte-for-byte equivalent** to the brief’s Step 1 snippet (including the leading path comment). No missing or extra SQL relative to the brief.

**Report claims verified:**

- “Created verbatim per brief” — **confirmed** by diff.
- “Git commit (migration only)” — **confirmed** (only `20260808120000_fynn_proposals.sql` in commit).
- “Unrelated dirty files not committed” — **not in diff scope**; commit scope is clean.

**Report claims not verifiable from diff:**

- `npx supabase db push` failure and migration history drift — plausible operational note; not part of the committed change set.

### Brief Step 2 (apply migration)

Step 2 is **not satisfied** in the implementer’s environment (push failed). That is an **operational / acceptance** gap, not a defect in the committed artifact. For this gate, **in-repo deliverables match the brief**; remote apply remains for the operator after history sync.

### Design spec alignment (`docs/superpowers/specs/2026-08-08-fynn-llm-tools-design.md`)

The migration implements the documented `fynn_proposals` fields and RLS shape (select/insert/update own rows). No conflict with the approved design.

---

## Task quality

### Strengths

- **Focused change:** One small migration file; matches “prefer small focused files.”
- **Repo consistency:** Same `user_id → public.profiles(id) ON DELETE CASCADE`, RLS policy naming style, and `GRANT ALL … TO anon, authenticated, service_role` pattern as e.g. `20260803180000_settings_and_feedback.sql` and `20260803190000_data_exports_storage.sql`.
- **Idempotency:** `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS` — safe for re-run tooling.
- **Query support:** Composite index matches likely access pattern (user’s proposals by status, ordered by expiry).
- **Security model:** RLS on client-facing roles; no DELETE policy matches brief and supports audit-style retention (Edge / service role can still manage rows outside client DELETE).

### Risks / follow-ups (non-blocking for this task)

- **Migration history drift:** Until local/remote migration lists align, the table will not exist on the linked project — downstream tasks should not assume live schema until push/repair.
- **INSERT path:** Client JWT inserts must set `user_id` to the authenticated user; Edge using service role bypasses RLS and must enforce ownership in function code (future tasks).
- **UPDATE scope:** Policy allows any column update on own rows; spec notes prefer Edge-owned status transitions — acceptable for v1; tightening (e.g. column-level or CHECK on transitions) can be a later hardening task.

---

## Findings

### Critical

None.

### Important

1. **Migration not applied on linked Supabase project** — Brief Step 2 incomplete; operator must repair migration history (per CLI) or sync local migrations, then re-run `npx supabase db push` (or equivalent deploy). Does not require changes to this commit’s SQL.

### Minor

1. **`created_at` default** uses `now()` while some sibling migrations use `timezone('utc', now())` — cosmetic consistency only; not introduced as a new pattern problem for this table alone.
2. **Top-of-file path comment** — Redundant with filename; harmless and matches brief template.

---

## Verdict

**Spec compliance: ✅** — Committed migration and commit scope match the brief and global constraints; no extra files in the task commit.

**Task quality: Approved** — Migration is correct, consistent with the repo, and ready to merge from a code perspective; apply Step 2 after migration history is aligned.
