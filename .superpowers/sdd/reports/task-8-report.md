# Task 8: Chat persistence

## Status

DONE_WITH_CONCERNS

## Delivered

- Added `fynn_chats` and `fynn_messages` with user-scoped RLS, ownership-preserving chat/message foreign keys, proposal metadata, and chat recency updates.
- Updated `fynn-chat` to create or verify chats, load server-side history, persist user and assistant turns, and return `chatId`.
- Updated the Fynn client to load persisted sidebar chats, use returned chat IDs, and save proposal status changes.

## Commit

- `8548d90 feat: persist Fynn chats server-side with RLS`

## Verification

- `npx tsc --noEmit` passed.
- `npm run lint` passed with 23 existing warnings and no errors.
- IDE diagnostics found no errors in the edited TypeScript files.
- Added Edge-function coverage for chat creation and message persistence, but it could not run because `deno` is not installed in this environment.

## Concern

`npx supabase db push` was attempted and failed before applying the migration because remote migration versions `20260804120000` and `20260804130000` are absent locally, while local migration `20260808120000` is absent remotely. The implementation was committed as requested; reconcile migration history before retrying the push.

## Fix

- Resolved Important #1: `fynn-chat` now returns the persisted `userMessageId` and `messageId` UUIDs for both plain assistant replies and proposal replies.
- The Fynn UI replaces its optimistic user and assistant/proposal message IDs with those server IDs, so `updateFynnProposalMessage` targets the persisted proposal row when Accept or Reject is selected.
- Added regression assertions for returned IDs on assistant and proposal responses. `npx --yes deno test supabase/functions/fynn-chat/index.test.ts` passes (4 tests).
- Migration deployment remains an operator action. No database push was attempted as part of this fix; reconcile the migration history noted above before deploying.
