# Task 9 Report: Hardening + second provider env swap

## Status

DONE_WITH_CONCERNS

## Delivered

- Added `supabase/functions/_shared/llm/openai.ts`, an OpenAI Chat Completions
  tools adapter that maps the shared message/tool contract, parses function-call
  arguments, generates fallback tool-call IDs, and keeps transport/API-key errors
  redacted.
- Wired `LLM_PROVIDER=openai` in the provider factory with
  `gpt-4o-mini` as the default OpenAI model. Gemini remains the default provider.
- Confirmed the existing six-iteration chat cap, 25-record server-side list cap,
  and 10-minute proposal TTL; added a 20-valid-turns-per-user rolling-minute
  in-memory limiter to `fynn-chat`.
- Updated deploy notes with OpenAI swap, deploy, smoke, restore-to-Gemini, and
  hardening-limit instructions.

## Commit

- `9fed4d9 feat: add env-swappable LLM providers and Fynn hardening`

## Tests

- `npx --yes deno test --allow-all supabase/functions` — 21 passed, 0 failed.
- `git diff --check` — passed.

## Concerns

- The new rate limit is intentionally per Edge isolate and therefore best-effort,
  not a shared global limit. The deployment notes document this limitation and
  recommend a shared store for scaled abuse prevention.
- No live OpenAI or Gemini smoke ran because this workspace has no supplied
  provider secrets or deploy credentials. The documented commands cover an
  environment-only swap, one authenticated read, one confirmed write, and return
  to Gemini.
