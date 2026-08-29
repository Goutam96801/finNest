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
