# Fynn LLM Tool Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing Fynn chat tab to a provider-agnostic LLM tool agent on Supabase Edge that can read and (after user confirm) mutate only the logged-in user’s data, defaulting to Gemini free tier.

**Architecture:** Expo app calls Edge Functions via `supabase.functions.invoke` with the user session. Edge runs an LLM adapter (`LLM_PROVIDER` + `LLM_API_KEY`) with a fixed tool catalog. Read tools use a JWT-scoped Supabase client (RLS). Write tools only insert rows into `fynn_proposals`; Fynn confirm cards call `fynn-confirm` to accept/reject.

**Tech Stack:** Expo SDK 54, Supabase (Postgres + Edge/Deno), Gemini API (dev default), existing `lib/services/*` validation rules mirrored under `supabase/functions/_shared/`.

**Spec:** `docs/superpowers/specs/2026-08-08-fynn-llm-tools-design.md`

## Global Constraints

- Expo SDK 54 — do not upgrade Expo major.
- Never put LLM keys in `EXPO_PUBLIC_*` or the mobile bundle.
- Tool CRUD must use the **user JWT** client, not the service role.
- Ignore any `user_id` the model invents; always `auth.uid()`.
- Every create/update/delete requires an Accept on a confirm card.
- Prefer small focused files under `supabase/functions/_shared/`.
- Follow existing Edge CORS/auth patterns in `supabase/functions/export-transactions/index.ts`.
- Client invokes Edge via `supabase.functions.invoke` like `lib/services/settings.ts`.

## File map (create / modify)

| Path | Responsibility |
| --- | --- |
| `supabase/migrations/20260808120000_fynn_proposals.sql` | `fynn_proposals` (+ later chats in Task 8) |
| `supabase/functions/_shared/cors.ts` | Shared CORS helpers |
| `supabase/functions/_shared/auth.ts` | JWT → `{ user, userClient }` |
| `supabase/functions/_shared/llm/types.ts` | Provider-agnostic message/tool types |
| `supabase/functions/_shared/llm/provider.ts` | Factory from env |
| `supabase/functions/_shared/llm/gemini.ts` | Gemini adapter |
| `supabase/functions/_shared/llm/openai.ts` | OpenAI-compatible adapter (stub ok until Task 9) |
| `supabase/functions/_shared/tools/catalog.ts` | Tool definitions JSON schemas |
| `supabase/functions/_shared/tools/executor.ts` | Dispatch read + propose tools |
| `supabase/functions/_shared/tools/reads.ts` | Read implementations |
| `supabase/functions/_shared/tools/proposals.ts` | Insert pending proposals |
| `supabase/functions/_shared/tools/apply.ts` | Apply accepted proposals |
| `supabase/functions/_shared/validate.ts` | Amounts, account types, categories |
| `supabase/functions/fynn-chat/index.ts` | Chat + tool loop |
| `supabase/functions/fynn-confirm/index.ts` | Accept / reject proposal |
| `lib/services/fynn.ts` | Client wrappers for chat + confirm |
| `app/(tabs)/fynn.tsx` | Wire UI to API + confirm cards |
| `docs/superpowers/settings-deploy-notes.md` | Secrets / deploy checklist (append) |

---

### Task 1: Migration — `fynn_proposals`

**Files:**
- Create: `supabase/migrations/20260808120000_fynn_proposals.sql`

**Interfaces:**
- Consumes: existing `public.profiles(id)`
- Produces: table `public.fynn_proposals` with RLS for own rows

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/20260808120000_fynn_proposals.sql
CREATE TABLE IF NOT EXISTS public.fynn_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  payload jsonb NOT NULL,
  summary text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS fynn_proposals_user_status_idx
  ON public.fynn_proposals (user_id, status, expires_at DESC);

ALTER TABLE public.fynn_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own fynn proposals"
  ON public.fynn_proposals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own fynn proposals"
  ON public.fynn_proposals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own fynn proposals"
  ON public.fynn_proposals FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT ALL ON TABLE public.fynn_proposals TO anon, authenticated, service_role;
```

- [ ] **Step 2: Apply migration** (local or linked project)

Run: `npx supabase db push` (or your project’s usual migrate command)  
Expected: migration applied; table visible in Studio.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260808120000_fynn_proposals.sql
git commit -m "feat: add fynn_proposals table for confirmed LLM mutations"
```

---

### Task 2: Edge shared auth + CORS

**Files:**
- Create: `supabase/functions/_shared/cors.ts`
- Create: `supabase/functions/_shared/auth.ts`

**Interfaces:**
- Produces: `corsHeaders`, `json()`, `getAuthedUserClient(req)` → `{ user, userClient, authHeader }`

- [ ] **Step 1: Add CORS helper**

```ts
// supabase/functions/_shared/cors.ts
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
```

- [ ] **Step 2: Add auth helper (mirror export-transactions)**

```ts
// supabase/functions/_shared/auth.ts
import { createClient, type User, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

export async function getAuthedUserClient(req: Request): Promise<{
  user: User
  userClient: SupabaseClient
  authHeader: string
}> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) throw new Error('Missing authorization')

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
    error,
  } = await userClient.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')

  return { user, userClient, authHeader }
}
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/cors.ts supabase/functions/_shared/auth.ts
git commit -m "feat: add shared Edge auth and CORS for Fynn"
```

---

### Task 3: LLM provider adapter (Gemini default)

**Files:**
- Create: `supabase/functions/_shared/llm/types.ts`
- Create: `supabase/functions/_shared/llm/gemini.ts`
- Create: `supabase/functions/_shared/llm/provider.ts`

**Interfaces:**
- Consumes: env `LLM_PROVIDER`, `LLM_API_KEY`, optional `LLM_MODEL`
- Produces: `getLlmProvider(): LlmProvider` with `complete({ messages, tools })`

- [ ] **Step 1: Shared types**

```ts
// supabase/functions/_shared/llm/types.ts
export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export type ChatMessage = {
  role: ChatRole
  content: string
  toolCallId?: string
  name?: string
}

export type ToolDef = {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type ToolCall = {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export type CompleteResult = {
  assistantText?: string
  toolCalls: ToolCall[]
}

export interface LlmProvider {
  complete(input: {
    messages: ChatMessage[]
    tools: ToolDef[]
  }): Promise<CompleteResult>
}
```

- [ ] **Step 2: Gemini adapter**

Use Gemini `generativelanguage.googleapis.com` tool-calling API (functionDeclarations). Map OpenAI-style tools ↔ Gemini function calls. Default model: `gemini-2.0-flash` (or current free-tier flash model if docs differ — prefer env override).

```ts
// supabase/functions/_shared/llm/gemini.ts
import type { ChatMessage, CompleteResult, LlmProvider, ToolDef } from './types.ts'

export function createGeminiProvider(apiKey: string, model: string): LlmProvider {
  return {
    async complete({ messages, tools }): Promise<CompleteResult> {
      // Map messages + tools to Gemini generateContent body.
      // Parse functionCall parts into ToolCall[].
      // Throw clear Error if HTTP !ok (include status, not apiKey).
      throw new Error('Implement Gemini tool calling here')
    },
  }
}
```

Implement fully in this task (no leftover `throw new Error('Implement...')`). Follow current Gemini tool-calling request/response shapes from Google’s docs for the chosen model.

- [ ] **Step 3: Provider factory**

```ts
// supabase/functions/_shared/llm/provider.ts
import { createGeminiProvider } from './gemini.ts'
import type { LlmProvider } from './types.ts'

export function getLlmProvider(): LlmProvider {
  const provider = (Deno.env.get('LLM_PROVIDER') ?? 'gemini').toLowerCase()
  const apiKey = Deno.env.get('LLM_API_KEY')
  if (!apiKey) throw new Error('LLM_API_KEY is not set')

  if (provider === 'gemini') {
    const model = Deno.env.get('LLM_MODEL') ?? 'gemini-2.0-flash'
    return createGeminiProvider(apiKey, model)
  }

  throw new Error(`Unsupported LLM_PROVIDER: ${provider}`)
}
```

- [ ] **Step 4: Set Edge secrets (manual / documented)**

```bash
npx supabase secrets set LLM_PROVIDER=gemini LLM_API_KEY=YOUR_KEY LLM_MODEL=gemini-2.0-flash
```

Append the same keys to `docs/superpowers/settings-deploy-notes.md`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/llm docs/superpowers/settings-deploy-notes.md
git commit -m "feat: add Gemini LLM provider adapter for Fynn"
```

---

### Task 4: Read tools + catalog skeleton

**Files:**
- Create: `supabase/functions/_shared/validate.ts`
- Create: `supabase/functions/_shared/tools/catalog.ts`
- Create: `supabase/functions/_shared/tools/reads.ts`
- Create: `supabase/functions/_shared/tools/executor.ts`

**Interfaces:**
- Consumes: `userClient`, verified `user.id`
- Produces: `TOOL_DEFS`, `executeTool({ name, args, user, userClient })` for **reads only** in this task

- [ ] **Step 1: Validators**

```ts
// supabase/functions/_shared/validate.ts
export function assertPositiveAmount(amount: unknown): number {
  const n = typeof amount === 'number' ? amount : Number(amount)
  if (!Number.isFinite(n) || n <= 0) throw new Error('Amount must be a positive number')
  return n
}

export const ALLOWED_ACCOUNT_TYPES = [
  'bank', 'cash', 'wallet', 'credit_card', 'investment', 'loan', 'other',
] as const
```

- [ ] **Step 2: Catalog (read tools first)**

Define JSON-schema `parameters` for:

- `list_accounts`
- `list_transactions` (limit≤25, optional type/accountId/from/to/search)
- `get_transaction`
- `list_subscriptions`
- `get_profile`
- `list_notifications`

- [ ] **Step 3: Read implementations**

Use `.eq('user_id', user.id)` **and** rely on RLS. Never trust args.userId.

Cap lists at 25 rows. Return compact JSON (ids, amounts, dates, names) suitable for the model.

- [ ] **Step 4: Executor dispatcher**

```ts
export async function executeTool(input: {
  name: string
  args: Record<string, unknown>
  userId: string
  userClient: SupabaseClient
}): Promise<{ ok: true; result: unknown } | { ok: false; error: string }>
```

Unknown tool → `{ ok: false, error: 'Unknown tool' }`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/validate.ts supabase/functions/_shared/tools
git commit -m "feat: add Fynn read tools and catalog"
```

---

### Task 5: `fynn-chat` Edge Function (read-only turns)

**Files:**
- Create: `supabase/functions/fynn-chat/index.ts`
- Create: `lib/services/fynn.ts`
- Modify: `app/(tabs)/fynn.tsx`

**Interfaces:**
- Consumes: Task 3 provider + Task 4 tools
- Produces: HTTP `{ type: 'message', text }` responses for read-only chats

- [ ] **Step 1: Implement `fynn-chat`**

Behavior:

1. Handle OPTIONS with CORS.
2. `getAuthedUserClient(req)`.
3. Parse body `{ message: string, history?: { role, content }[] }`.
4. Build system prompt: you are Fynn; use tools for this user’s money data; never invent balances; only listed tools.
5. Loop up to **6** iterations: `provider.complete` → if toolCalls, execute each, append tool results as `role: 'tool'` messages → else return assistant text.
6. Respond `json({ type: 'message', text })`.

- [ ] **Step 2: Client service**

```ts
// lib/services/fynn.ts
import { supabase } from '@/lib/supabase'
import { ResponseType } from '@/types'

export type FynnChatResponse =
  | { type: 'message'; text: string }
  | { type: 'proposal'; proposalId: string; summary: string; preview: unknown; text?: string }

export async function sendFynnMessage(
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[] = []
): Promise<ResponseType & { data?: FynnChatResponse }> {
  const { data, error } = await supabase.functions.invoke('fynn-chat', {
    body: { message, history },
  })
  if (error) return { success: false, msg: error.message }
  if (data?.error) return { success: false, msg: String(data.error) }
  return { success: true, data: data as FynnChatResponse }
}
```

- [ ] **Step 3: Wire `fynn.tsx`**

Replace placeholder assistant text with `sendFynnMessage`. Show loading state; on failure show `msg` as assistant error bubble. Keep local chat state for now (persist in Task 8).

- [ ] **Step 4: Deploy + smoke**

```bash
npx supabase functions deploy fynn-chat
```

In-app (logged in): “List my accounts” / “What did I spend recently?”  
Expected: real data from your DB, no writes.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/fynn-chat lib/services/fynn.ts "app/(tabs)/fynn.tsx"
git commit -m "feat: wire Fynn chat to Edge LLM with read tools"
```

---

### Task 6: Propose tools + `fynn-confirm` + confirm UI

**Files:**
- Modify: `supabase/functions/_shared/tools/catalog.ts`
- Create/Modify: `supabase/functions/_shared/tools/proposals.ts`
- Create: `supabase/functions/_shared/tools/apply.ts`
- Create: `supabase/functions/fynn-confirm/index.ts`
- Modify: `supabase/functions/fynn-chat/index.ts`
- Modify: `lib/services/fynn.ts`
- Modify: `app/(tabs)/fynn.tsx`

**Interfaces:**
- Produces: `type: 'proposal'` chat responses; `confirmFynnProposal(proposalId, 'accept' | 'reject')`

- [ ] **Step 1: Add propose_* tools for transactions first**

- `propose_create_transaction`
- `propose_update_transaction`
- `propose_delete_transaction`

Each implementation:

1. Validate args (amount, type, account ownership via select on `accounts`).
2. Insert into `fynn_proposals` with `expires_at = now() + 10 minutes`, `status = pending`, human `summary`.
3. Return `{ proposal_id, summary, preview }` to the model.
4. Chat handler: if any tool result contains `proposal_id`, prefer returning `{ type: 'proposal', ... }` to the client (assistant text optional).

- [ ] **Step 2: `fynn-confirm`**

```ts
// body: { proposal_id: string, action: 'accept' | 'reject' }
```

1. Auth required.
2. Load proposal where `id` + `user_id = user.id` + `status = pending`.
3. If `expires_at < now()` → mark `expired`, return error.
4. Reject → set `rejected` + `resolved_at`.
5. Accept → run `applyProposal(userClient, proposal)` then set `accepted`.
6. `applyProposal` switches on `tool_name` and performs the domain insert/update/delete via `userClient` only.

- [ ] **Step 3: Client confirm API**

```ts
export async function confirmFynnProposal(
  proposalId: string,
  action: 'accept' | 'reject'
): Promise<ResponseType & { data?: unknown }> {
  const { data, error } = await supabase.functions.invoke('fynn-confirm', {
    body: { proposal_id: proposalId, action },
  })
  // map errors like sendFynnMessage
}
```

- [ ] **Step 4: Confirm card in Fynn UI**

When response `type === 'proposal'`, render a card with `summary`, Accept / Reject buttons. Disable buttons while invoking. On accept success, append a short assistant confirmation message.

- [ ] **Step 5: Deploy + smoke**

```bash
npx supabase functions deploy fynn-chat
npx supabase functions deploy fynn-confirm
```

Ask: “Add expense ₹50 for tea on Cash”. Expect confirm card → Accept → row in `transactions` for **you** only. Reject path leaves DB unchanged.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions lib/services/fynn.ts "app/(tabs)/fynn.tsx"
git commit -m "feat: add Fynn mutation proposals with confirm/reject"
```

---

### Task 7: Remaining entity propose_* tools

**Files:**
- Modify: `supabase/functions/_shared/tools/catalog.ts`
- Modify: `supabase/functions/_shared/tools/proposals.ts`
- Modify: `supabase/functions/_shared/tools/apply.ts`

**Interfaces:**
- Extends Task 6 apply switch for accounts, subscriptions, profile, notifications

- [ ] **Step 1: Add tools**

Accounts: create / update / delete (delete only if existing app rules allow — otherwise return a proposal that Edge rejects with a clear error, or block at propose time).  
Subscriptions: create / update / delete.  
Profile: `propose_update_profile` — only `full_name`, `currency`, `timezone`, `subscription_reminders_enabled`, `low_balance_alerts_enabled`, `low_balance_threshold`.  
Notifications: `propose_mark_notification_read` (one id or all).

- [ ] **Step 2: Apply handlers**

Mirror constraints from `lib/services/accounts.ts`, `subscriptions.ts`, `profile.ts`, `notifications.ts` (positive amounts, allowed types, ownership).

- [ ] **Step 3: Smoke each entity**

One accept + one reject per entity group. Verify RLS: forging another user’s UUID in payload still fails (row not found / RLS).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/tools
git commit -m "feat: extend Fynn propose/apply tools to all user entities"
```

---

### Task 8: Chat persistence (optional but planned)

**Files:**
- Create: `supabase/migrations/20260808130000_fynn_chats.sql`
- Modify: `fynn-chat`, `lib/services/fynn.ts`, `fynn.tsx`

- [ ] **Step 1: Tables `fynn_chats` + `fynn_messages`** with RLS `auth.uid() = user_id`

- [ ] **Step 2: `fynn-chat` accepts `chat_id`; creates chat on first message; stores user + assistant (+ proposal metadata) messages

- [ ] **Step 3: Client loads recent chats for sidebar from Supabase instead of only local state

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: persist Fynn chats server-side with RLS"
```

---

### Task 9: Hardening + second provider env swap

**Files:**
- Create: `supabase/functions/_shared/llm/openai.ts` (or Anthropic)
- Modify: `provider.ts`
- Modify: chat loop (rate / iteration already present — verify)
- Modify: deploy notes

- [ ] **Step 1: Add OpenAI-compatible adapter** behind `LLM_PROVIDER=openai`

- [ ] **Step 2: Env-only smoke**

```bash
npx supabase secrets set LLM_PROVIDER=openai LLM_API_KEY=... LLM_MODEL=gpt-4o-mini
```

No app rebuild; one read turn + one confirmed write must still work. Switch back to Gemini for default for free-tier.

- [ ] **Step 3: Caps**

Confirm: max 6 tool iterations, list limit 25, proposal TTL 10m, basic per-user rate limit (in-memory per isolate is ok for v1; document limitation).

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add env-swappable LLM providers and Fynn hardening"
```

---

### Task 10: Spec / docs closeout

**Files:**
- Modify: `docs/superpowers/specs/2026-08-08-fynn-llm-tools-design.md` (status → Implemented)
- Modify: `docs/superpowers/settings-deploy-notes.md` if anything missing

- [ ] **Step 1: Checklist against spec success criteria**

- [ ] Read answers backed by DB  
- [ ] Confirm card required for writes  
- [ ] Provider swap via env  
- [ ] Unauthenticated → 401  

- [ ] **Step 2: Commit**

```bash
git commit -m "docs: mark Fynn LLM tool agent design implemented"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| Edge host + user JWT | 2, 5 |
| Gemini default / env swap | 3, 9 |
| Read tools | 4, 5 |
| Confirm-all writes | 6 |
| All entities | 7 |
| RLS + ignore forged user_id | 4–7 |
| Chat persistence | 8 |
| No Cursor MCP in v1 | (explicit non-goal) |
| Secrets not in Expo | 3, Global Constraints |

No TBD placeholders remain in task steps. Confirm is **client-driven** (`fynn-confirm`), matching the approved design.
