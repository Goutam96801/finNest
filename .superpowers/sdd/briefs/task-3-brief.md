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
