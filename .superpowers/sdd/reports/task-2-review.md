# Task 2 Review — Edge shared auth + CORS

**Reviewer:** Task-scoped gate (read-only)  
**Base:** `ee4719f820c1664360544e248810ba619339faf2`  
**Head:** `54fc06add139142f08ae690e4ac6f1277beeabf5`  
**Brief:** `.superpowers/sdd/briefs/task-2-brief.md`  
**Diff source:** `.superpowers/sdd/reviews/task-2-review-pkg.md`

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
| Create `supabase/functions/_shared/cors.ts` with `corsHeaders`, `json()` | ✅ | Diff lines 53–64 match brief Step 1 |
| Create `supabase/functions/_shared/auth.ts` with `getAuthedUserClient(req)` | ✅ | Diff lines 22–47 match brief Step 2 |
| Returns `{ user, userClient, authHeader }` | ✅ | Return shape and types in diff |
| Uses `SUPABASE_URL`, `SUPABASE_ANON_KEY`; no service role | ✅ | Only anon env + user-scoped client in diff |
| Errors: `Missing authorization`, `Unauthorized` | ✅ | Diff lines 31, 44 |
| Import `@supabase/supabase-js@2.49.1` via esm.sh | ✅ | Diff line 23 |
| Commit message `feat: add shared Edge auth and CORS for Fynn` | ✅ | Review package commits section |
| Commit contains **only** the two `_shared` files | ✅ | `git show` stat: 2 files, 36 insertions |

**Diff vs brief:** Committed `auth.ts` and `cors.ts` are **equivalent** to the brief snippets (shared helper adds explicit `User` / `SupabaseClient` types as specified).

**Global constraints:**

| Constraint | Verdict | Evidence |
|------------|---------|----------|
| User JWT client with anon key (no service role for tool CRUD) | ✅ | No `SUPABASE_SERVICE_ROLE_KEY` or second `createClient` in `auth.ts` |
| Match `export-transactions` auth pattern | ✅ | Same header read, env vars, `createClient(url, anon, { global: { headers: { Authorization } } })`, `auth.getUser()`, same throw messages (compare `export-transactions/index.ts` lines 18–33) |
| CORS matches export-transactions | ✅ | Identical `corsHeaders` and `json()` body/header pattern (compare lines 4–15) |
| Commit scope only shared helpers | ✅ | Single commit; paths limited to `_shared/auth.ts`, `_shared/cors.ts` |

**Report claims verified:**

- “Mirrors export-transactions user-validation path; no admin client” — **confirmed** by diff and side-by-side with `getAuthedUser` user leg in `export-transactions`.
- “Files in commit” / excluded app and `.superpowers/` — **confirmed** for this commit.
- “Brief parity” — **confirmed** by diff.

**Report claims not verifiable from diff:**

- Working tree still has unrelated modified/untracked files — **out of scope** for this commit; commit itself is clean.

---

## Task quality

### Strengths

- **Minimal, focused deliverable:** Two small modules, no drive-by refactors.
- **Correct security posture for Fynn tools:** Validates JWT via `getUser()` and returns a client that will enforce RLS on subsequent queries.
- **Consistency:** CORS and auth user leg align with the only existing Edge function pattern in the repo.
- **Clear consumer contract:** Exported names match the brief; report documents thrown errors and OPTIONS handling expectation.

### Residual risks (non-blocking)

- **Call-site responsibility:** Helpers throw `Error`; HTTP status mapping (e.g. 401 vs 400) lives in each function handler—same as `export-transactions`, which maps all catch errors to 400.
- **No `_shared` consumers yet:** Wiring and error handling will be proven when Fynn Edge entrypoints land (out of scope for Task 2).

---

## Findings

No P0–P2 defects introduced by the reviewed diff.

### Critical

None.

### Important

None.

### Minor

1. **`json()` response shape** — Signature requires `Record<string, unknown>`; top-level JSON arrays or primitives need a different helper or wrapper. Matches brief and `export-transactions`; Fynn authors should follow the same object wrapper pattern.
2. **No automated Edge tests** — Repo has no Deno test harness for `_shared`; acceptable for this task; consider lightweight tests when the first consumer is added.
3. **Commit trailer** — `Co-authored-by: Cursor` present; harmless; not required by brief.

---

## Verdict

**Spec compliance: ✅** — Both modules, exports, env usage, and commit scope match the brief and global constraints.

**Task quality: Approved** — Shared helpers are correct, appropriately scoped, and ready for downstream Fynn Edge functions to import.
