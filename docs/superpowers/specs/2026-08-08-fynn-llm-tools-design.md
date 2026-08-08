# Fynn LLM Tool Agent Design

**Date:** 2026-08-08  
**Status:** Approved for planning (product decisions locked in brainstorming)  
**App surface:** In-app Fynn chat (`app/(tabs)/fynn.tsx`)  
**Hosting:** Supabase Edge Function  
**Default LLM:** Gemini free tier (provider swap via env)

## Problem

Fynn is a polished chat UI that still returns placeholder text. Users want natural-language help that can **read and change their own money data** (transactions, accounts, subscriptions, profile, notifications), with Gemini for development cost and a path to swap LLM providers without rewriting the app.

## Goals

1. Wire Fynn to a real LLM that understands the user’s logged-in data context.
2. Expose a fixed **tool catalog** for CRUD over user-owned entities only.
3. Keep API keys server-side; never ship LLM secrets in Expo / `EXPO_PUBLIC_*`.
4. Default to Gemini free tier; switch provider (OpenAI / Anthropic / etc.) by env only.
5. **Never auto-commit writes** — confirm cards in Fynn before create/update/delete.
6. Rely on existing Supabase **RLS** (`auth.uid()`) plus defense-in-depth filters.

## Non-goals (v1)

- True Cursor MCP protocol server (can wrap the same tools later).
- Free-form SQL or admin / service-role table access from the model.
- Cross-user data, Razorpay / payment actions, or account deletion via chat.
- Receipt image upload / OCR via chat.
- Multi-user “family” scopes.

## Decisions locked

| Decision | Choice |
| --- | --- |
| Primary UI | In-app Fynn chat |
| Entities | All user-owned: transactions, accounts, subscriptions, profile (safe fields), notifications |
| Writes | Confirm every create / update / delete |
| Host | Supabase Edge Function |
| Shape | In-app agent with provider-agnostic tools (not Cursor MCP yet) |
| Auth for tools | User JWT → user-scoped Supabase client (RLS) |

## Architecture

```text
┌─────────────────────┐     JWT + message      ┌──────────────────────────────┐
│  Expo app           │ ─────────────────────► │  Edge: fynn-chat             │
│  app/(tabs)/fynn.tsx│◄──── reply / proposal ─│  - auth gate                 │
│  Confirm card UI    │     or final answer    │  - LLM provider adapter      │
│                     │                        │  - tool loop (reads + propose)│
│  confirm / reject   │ ─────────────────────► │  Edge: fynn-confirm          │
│  (proposal_id)      │◄──── mutation result ──│  - apply or discard proposal │
└─────────────────────┘                        └──────────────┬───────────────┘
                                                              │ user JWT
                                                              ▼
                                                   ┌──────────────────────┐
                                                   │ Supabase (RLS)       │
                                                   │ transactions, etc.   │
                                                   │ fynn_proposals       │
                                                   │ fynn_chats (phase 5) │
                                                   └──────────────────────┘
```

### Request flow (chat turn)

1. Client calls `fynn-chat` with `Authorization: Bearer <session access token>`, `chat_id` (optional), and `message`.
2. Edge validates the user via `supabase.auth.getUser()`.
3. Edge loads short conversation history (v1: last N messages from request body or DB).
4. Edge invokes the LLM with system prompt + tool definitions.
5. Tool loop:
   - **Read tools** execute immediately with the user JWT client.
   - **Write tools** only create a **pending proposal** row; they do not mutate domain tables.
6. Edge returns either:
   - `{ type: "message", text, chat_id }`, or
   - `{ type: "proposal", proposal_id, summary, preview, chat_id }` (and optional assistant text).
7. If proposal: Fynn renders a confirm card. Accept → `fynn-confirm { proposal_id, action: "accept" }`. Reject → `action: "reject"`.
8. `fynn-confirm` re-checks ownership + expiry, then applies the mutation with the user JWT client (RLS still enforced).

### Why Edge tool loop (not client-only apply)

- One place for provider secrets and prompt/tool policy.
- Same path for reads and proposal creation.
- Client still owns UX confirmation; domain writes only after explicit accept.
- Matches existing Edge auth pattern in `supabase/functions/export-transactions/index.ts`.

## Security

1. **Secrets:** `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL` (optional), plus existing `SUPABASE_URL` / `SUPABASE_ANON_KEY`. Never in the mobile bundle.
2. **Auth:** Missing/invalid JWT → `401`. No anonymous chat.
3. **Data plane:** Tools use anon key + user `Authorization` header so RLS applies. Do **not** use the service role for tool CRUD.
4. **Defense in depth:** Ignore any `user_id` / `uid` the model invents; always set `user_id = auth.uid()` from the verified session.
5. **Write gate:** Proposals expire after **10 minutes**, are single-use, and are keyed by `user_id`. Accept/reject must be the same user.
6. **Caps:** Max tool iterations per turn (e.g. 6), max rows per list tool (e.g. 25), soft rate limit per user per minute.
7. **Prompt hygiene:** System prompt states the model may only use listed tools; no invented IDs; summarize rather than dump raw dumps of history.
8. **Profile writes:** Allow only safe columns (`full_name`, `currency`, `timezone`, notification preference fields). Forbidden: email, password, `deleted_at`, ids of other users.

## Provider adapter

Internal interface (conceptual):

```ts
type ChatMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; toolCallId?: string }
type ToolDef = { name: string; description: string; parameters: object }
type ToolCall = { id: string; name: string; arguments: unknown }

interface LlmProvider {
  complete(input: {
    messages: ChatMessage[]
    tools: ToolDef[]
  }): Promise<{
    assistantText?: string
    toolCalls: ToolCall[]
  }>
}
```

- `LLM_PROVIDER=gemini` (default for dev) | `openai` | `anthropic`
- `LLM_API_KEY` required
- `LLM_MODEL` optional; sensible defaults per provider (Gemini free-tier flash model for dev)
- Adding a provider = new adapter file + env change. Tool catalog and Fynn UI stay stable.

## Tool catalog (v1)

### Reads (no confirm)

| Tool | Purpose |
| --- | --- |
| `list_accounts` | User accounts (optional include archived) |
| `list_transactions` | Paged, filter by type / account / date / search |
| `get_transaction` | Single transaction by id (must belong to user) |
| `list_subscriptions` | Active / all subscriptions |
| `get_profile` | Safe profile fields |
| `list_notifications` | Recent notifications + unread filter |

### Writes (propose only)

| Tool | Purpose |
| --- | --- |
| `propose_create_transaction` | Expense / income / transfer |
| `propose_update_transaction` | Patch fields |
| `propose_delete_transaction` | Delete by id |
| `propose_create_account` | New account |
| `propose_update_account` | Patch / archive / primary |
| `propose_delete_account` | Delete (only if app rules allow; otherwise refuse with message) |
| `propose_create_subscription` | New subscription |
| `propose_update_subscription` | Patch / toggle |
| `propose_delete_subscription` | Delete |
| `propose_update_profile` | Safe fields only |
| `propose_mark_notification_read` | One or all |

Confirm/reject is **not** an LLM tool in v1 — the **client** calls `fynn-confirm` after the user taps Accept/Reject. This avoids the model confirming itself.

### Validation

Mirror existing app rules from `lib/services/*` (positive amounts, allowed account types, category values from `constants/data`, ownership of `account_id` / `to_account_id`). Prefer shared Deno modules under `supabase/functions/_shared/` that duplicate critical validators (Edge cannot import RN app paths).

## Data model additions

### `fynn_proposals`

- `id` uuid PK  
- `user_id` uuid NOT NULL → profiles  
- `tool_name` text NOT NULL  
- `payload` jsonb NOT NULL (normalized mutation args)  
- `summary` text NOT NULL (human-readable for the confirm card)  
- `status` text NOT NULL: `pending` | `accepted` | `rejected` | `expired`  
- `expires_at` timestamptz NOT NULL  
- `created_at` / `resolved_at`  
- RLS: user can select/insert/update **own** rows only (updates limited to status transitions via Edge; prefer Edge-owned updates with user JWT).

### `fynn_chats` / `fynn_messages` (phase 5)

- User-scoped chat threads for multi-device history.  
- v1 may keep chats in memory / AsyncStorage on device if shipping tools faster; migrate in phase 5 without changing tool contracts.

## Client changes

- `app/(tabs)/fynn.tsx`: replace placeholder `sendMessage` with API call; loading / error states; render proposal cards.
- Small client module e.g. `lib/services/fynn.ts`: `sendFynnMessage`, `confirmFynnProposal`.
- Use authenticated Supabase session access token (same pattern as other Edge calls).
- Starter prompts become real queries (“Explain my spending” → list tools + summarize).

## Observability & ops

- Structured Edge logs: `user_id` hash or id, tool name, latency, provider, error code (no API keys, no full PII dumps).
- Document secrets in `docs/superpowers/` deploy notes (Gemini key, provider env, model override).
- Smoke checklist: Gemini path, then OpenAI path with env-only swap.

## Rollout phases

1. **Foundations** — Adapter + `fynn-chat` ping/auth + Gemini secrets.  
2. **Read tools** — List/get for core entities; Fynn answers read-only money questions.  
3. **Write proposals** — `fynn_proposals` + confirm UI + `fynn-confirm`.  
4. **Entity coverage** — Full propose_* for accounts, subscriptions, profile, notifications.  
5. **Persistence & polish** — Chat DB, better prompts, starter prompts, UX polish.  
6. **Hardening** — Rate limits, iteration caps, provider smoke tests, abuse cases.

## Success criteria

- Logged-in user can ask Fynn about **their** spending and get answers backed by DB reads.  
- Mutating asks show a confirm card; Accept applies; Reject does nothing; another user’s ids never succeed.  
- Switching `LLM_PROVIDER` + key changes the model without an Expo rebuild.  
- Unauthenticated requests fail closed.

## Open follow-ups (post-v1, not blocking plan)

- Optional Cursor MCP wrapper around the same tool executors.  
- Streaming tokens into Fynn.  
- Voice input.  
- Attachment / receipt tools.
