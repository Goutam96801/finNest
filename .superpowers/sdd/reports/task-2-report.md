# Task 2 Report: Edge shared auth + CORS

## Status

**DONE**

## Summary

Added shared Supabase Edge Function helpers for Fynn tools: CORS headers + JSON response helper, and JWT-scoped user authentication that returns a `SupabaseClient` bound to the caller's `Authorization` header (anon key only — no service role).

## Files created

| Path | Purpose |
|------|---------|
| `supabase/functions/_shared/cors.ts` | `corsHeaders`, `json()` |
| `supabase/functions/_shared/auth.ts` | `getAuthedUserClient(req)` → `{ user, userClient, authHeader }` |

## Implementation notes

- **CORS**: Matches `supabase/functions/export-transactions/index.ts` — `Access-Control-Allow-Origin: *` and the same allowed headers list.
- **Auth**: Mirrors the user-validation path from `export-transactions` (`createClient` with `SUPABASE_URL`, `SUPABASE_ANON_KEY`, global `Authorization` header, then `auth.getUser()`). Unlike export-transactions, this helper does **not** create a service-role admin client; downstream Fynn tool functions are expected to perform CRUD via `userClient` under RLS.
- **Imports**: `@supabase/supabase-js@2.49.1` via esm.sh, consistent with existing Edge functions.

## Commit

```
feat: add shared Edge auth and CORS for Fynn
```

Files in commit:

- `supabase/functions/_shared/cors.ts`
- `supabase/functions/_shared/auth.ts`

Excluded from commit (per task constraints): `app/(tabs)/_layout.tsx`, `components/CustomTabs.tsx`, `app/(tabs)/fynn.tsx`, `.superpowers/`.

## Verification

- No Deno test harness present in repo for `_shared` modules.
- Sanity check: file contents match task brief verbatim (paths, exports, signatures, env vars, error messages).
- Import paths and types align with brief (`User`, `SupabaseClient`, `Record<string, unknown>`).

## Test summary

Manual sanity-check only: brief parity confirmed for both modules; no automated Edge tests run.

## Concerns

None. Consumers should handle thrown errors (`Missing authorization`, `Unauthorized`) and OPTIONS preflight using `corsHeaders` from `cors.ts`.

## Next steps (out of scope)

- Wire `cors.ts` and `auth.ts` into individual Fynn Edge function entrypoints.
- Optionally refactor `export-transactions` to import shared helpers (not requested in this task).
