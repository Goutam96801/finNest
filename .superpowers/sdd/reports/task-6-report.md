# Task 6 Report: Fynn transaction proposals and confirmation

## Status

DONE_WITH_CONCERNS

## Delivered

- Added transaction proposal tools for create, update, and delete. They validate transaction values and owned accounts, then create a pending `fynn_proposals` row with a ten-minute expiry; no transaction mutation occurs during proposal creation.
- Added `fynn-confirm`, which uses the authenticated request client, ignores client-provided user identity, expires stale proposals, rejects without mutation, and applies accepted transaction proposals through the user JWT client.
- Added proposal responses to `fynn-chat`, the `confirmFynnProposal` client API, and Accept / Reject cards in the Fynn UI.

## Verification

- `npx deno test supabase/functions/fynn-chat/index.test.ts supabase/functions/fynn-confirm/index.test.ts` — 5 passed.
- `npx tsc --noEmit --pretty false` — passed.
- `npx expo lint` — passed with 23 existing workspace warnings and no errors.
- `git diff --check` — passed.

## Concerns

- Deployments for `fynn-chat` and `fynn-confirm` both failed before upload with Supabase HTTP 403: the configured account lacks privileges to list/deploy functions. Docker was also unavailable.
- The `fynn_proposals` migration must be applied to the target database before either function can persist or resolve proposals.
- Concurrent accept requests can theoretically race between applying the mutation and changing proposal status. The client disables duplicate taps; fully atomic single-use acceptance requires a database RPC/transaction and is outside the available proposal status model.
