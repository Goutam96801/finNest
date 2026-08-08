# Task 8 Review: Chat persistence

## Verdict

- **Spec:** ✅
- **Quality:** Good implementation aligned with the brief; one Important client/server ID gap and deployment/migration reconciliation remain before persistence is reliable in production.
- **Path reviewed:** `94065ec4bbe21ac873155d09289ffce47abf6fe4..8548d904f4443456d547529ac1a7484665357168`

## Spec checklist

| Requirement | Result |
|---|---|
| `fynn_chats` + `fynn_messages` with RLS `auth.uid() = user_id` | ✅ `supabase/migrations/20260808130000_fynn_chats.sql` enables RLS and CRUD policies on both tables using `auth.uid() = user_id`; composite `(chat_id, user_id)` FK prevents cross-user message attachment. |
| `fynn-chat` accepts `chat_id`, creates chat on first message, persists user + assistant (+ proposal metadata) | ✅ `supabase/functions/fynn-chat/index.ts` reads `body.chat_id`, `requireChat` / `createChat`, `listMessages`, `saveMessage` for user/assistant/proposal turns; responses include `chatId`. |
| Client sidebar loads recent chats from Supabase | ✅ `loadFynnChats()` in `lib/services/fynn.ts`; `app/(tabs)/fynn.tsx` hydrates `chats` on mount and sidebar lists them. |
| Commit `feat: persist Fynn chats server-side with RLS` | ✅ `8548d90` per report and review package. |

## Critical

None.

## Important

### [P2] Proposal status updates use ephemeral client message IDs

- **Path:** `app/(tabs)/fynn.tsx:128-144`, `app/(tabs)/fynn.tsx:189-194`, `lib/services/fynn.ts:50-60`

After a new proposal turn, the assistant row in local state uses `id: \`${timestamp}-assistant\``, while the edge function persists the message with a server-generated UUID and does not return that id. `confirmProposal` calls `updateFynnProposalMessage(messageId, …)` with the client id, so accept/reject updates the UI but usually fails to update `fynn_messages.proposal_metadata` until the user reloads (loaded chats use real UUIDs from `loadFynnChats`). Return the persisted message id from `fynn-chat` (proposal and plain message paths) or refetch messages after each turn.

### [P2] Migration not applied; local/remote history mismatch

- **Path:** `.superpowers/sdd/reports/task-8-report.md` (Verification / Concern)

The SQL and RLS look correct in repo, but `db push` failed because remote and local migration versions diverge. Until history is reconciled and `20260808130000_fynn_chats.sql` is applied, sidebar load and persistence will fail at runtime against the current remote project.

## Minor

### [P3] Silent failure when loading sidebar chats

- **Path:** `app/(tabs)/fynn.tsx:57-60`

If `loadFynnChats()` fails, the effect returns without surfacing an error; the sidebar stays empty with no retry or message.

### [P3] Post-accept confirmation line is local-only

- **Path:** `app/(tabs)/fynn.tsx:215-221`

“Transaction confirmed and applied.” is appended only in React state, not written to `fynn_messages`, so it disappears on reload.

### [P3] Tool-loop exhaustion leaves orphan user rows

- **Path:** `supabase/functions/fynn-chat/index.ts:162-167`, `234`

The user message is saved before the LLM loop; if six tool iterations exhaust without a final assistant text, the handler errors after persisting the user turn only.

### [P3] `GRANT ALL … TO anon` matches existing table convention

- **Path:** `supabase/migrations/20260808130000_fynn_chats.sql:89`

Same pattern as other migrations; acceptable while RLS gates on `auth.uid()`.

### [P3] Edge persistence tests not executed in author environment

- **Path:** `supabase/functions/fynn-chat/index.test.ts:140-192`

New Deno coverage for create + persist is present; report notes `deno` unavailable locally. Recommend running in CI or a Deno-capable environment.

### [P3] No test for continuing an existing `chat_id`

- **Path:** `supabase/functions/fynn-chat/index.test.ts`

Persistence test covers new-chat flow only; `requireChat` + `listMessages` + second-turn inserts are untested.

## Verification

- `npx tsc --noEmit --pretty false` — passed (re-run during review).
- Line-by-line review of migration, `fynn-chat`, `lib/services/fynn.ts`, `fynn.tsx`, and `task-8-review-pkg.md`.

## Path

`D:/Building/finnest-mob/.superpowers/sdd/reports/task-8-review.md`
