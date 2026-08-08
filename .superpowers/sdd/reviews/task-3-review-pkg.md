# Review package Task 3 (re-review after fix)
BASE: 54fc06add139142f08ae690e4ac6f1277beeabf5
HEAD: 63f6c4eb1646c7e7f5dd18d249df15b6cdf5a0c5

## Commits
63f6c4e fix: preserve Gemini tool-call ids and redact transport errors
735da21 feat: add Gemini LLM provider adapter for Fynn


## Stat
 .superpowers/sdd/reports/task-3-report.md       |  56 ++++++++
 docs/superpowers/settings-deploy-notes.md       |  13 ++
 supabase/functions/_shared/llm/gemini.test.ts   | 158 +++++++++++++++++++++++
 supabase/functions/_shared/llm/gemini.ts        | 163 ++++++++++++++++++++++++
 supabase/functions/_shared/llm/provider.test.ts |  28 ++++
 supabase/functions/_shared/llm/provider.ts      |  15 +++
 supabase/functions/_shared/llm/types.ts         |  32 +++++
 7 files changed, 465 insertions(+)


## Diff
```diff
diff --git a/.superpowers/sdd/reports/task-3-report.md b/.superpowers/sdd/reports/task-3-report.md
new file mode 100644
index 0000000..37a986b
--- /dev/null
+++ b/.superpowers/sdd/reports/task-3-report.md
@@ -0,0 +1,56 @@
+# Task 3 report: Gemini LLM provider adapter
+
+## Delivered
+
+- Added shared LLM types and the `getLlmProvider()` factory.
+- Added a Gemini REST adapter for `generateContent`, including system, user, model,
+  function-call, and function-response message mappings.
+- Added function-declaration tool mapping, response text extraction, deterministic
+  generated tool-call IDs, and status-only HTTP errors that do not expose API keys.
+- Documented Edge-only `LLM_PROVIDER`, `LLM_API_KEY`, and `LLM_MODEL` configuration.
+
+## Verification
+
+- `npx tsc --noEmit --target es2022 --module esnext --moduleResolution bundler --allowImportingTsExtensions --lib es2022,dom supabase/functions/_shared/llm/types.ts supabase/functions/_shared/llm/gemini.ts` passed.
+- Scoped IDE lint diagnostics reported no errors.
+- `git diff --check` passed.
+- A local Deno test was added for request/response mapping and non-secret HTTP errors,
+  but could not run because Deno is not installed on this workstation.
+
+## Deployment
+
+`LLM_API_KEY` was not available in the environment, so no live Gemini request or
+Supabase secret update was attempted. Set the secrets with:
+
+```bash
+npx supabase secrets set LLM_PROVIDER=gemini LLM_API_KEY=YOUR_KEY LLM_MODEL=gemini-2.0-flash
+```
+
+## Commit
+
+- `735da21 feat: add Gemini LLM provider adapter for Fynn`
+
+## Previously identified concern (resolved)
+
+The adapter previously generated synthetic call IDs and omitted Gemini's returned
+function-call correlation ID when continuing a tool interaction. The fix below
+preserves Gemini-provided IDs end-to-end.
+
+## Fix
+
+- Preserved Gemini `functionCall.id` through `ToolCall.id`, then included it in
+  the replayed model `functionCall` and matching tool `functionResponse`.
+- Moved the Gemini API key to the `x-goog-api-key` header and redacted fetch and
+  response-JSON parsing errors.
+- Added coverage for function-call ID round trips, rejected-fetch redaction, and
+  unsupported-provider validation before API-key validation.
+
+### Fix verification
+
+- `npx --yes deno test --allow-env supabase/functions/_shared/llm/gemini.test.ts supabase/functions/_shared/llm/provider.test.ts`
+
+  Output: `ok | 4 passed | 0 failed (115ms)`
+
+- Scoped IDE diagnostics show only the pre-existing missing `Deno` global
+  configuration errors in `provider.ts`; the Deno test type check completed
+  successfully.
diff --git a/docs/superpowers/settings-deploy-notes.md b/docs/superpowers/settings-deploy-notes.md
index 17329b4..6a85ce5 100644
--- a/docs/superpowers/settings-deploy-notes.md
+++ b/docs/superpowers/settings-deploy-notes.md
@@ -9,8 +9,21 @@ Includes settings columns, feedback, `data_exports`, and private `exports` stora
 
 ## Edge functions
 ```bash
 npx supabase functions deploy export-transactions
 npx supabase functions deploy delete-account
 ```
 
 Export: CSV/PDF ÔåÆ Storage `exports/{userId}/ÔÇª` (no email).
+
+## Fynn LLM Edge secrets
+
+Configure these secrets only for Supabase Edge Functions. Never expose them through
+`EXPO_PUBLIC_*` variables or include them in the mobile application.
+
+```bash
+npx supabase secrets set LLM_PROVIDER=gemini LLM_API_KEY=YOUR_KEY LLM_MODEL=gemini-2.0-flash
+```
+
+- `LLM_PROVIDER`: `gemini` (default)
+- `LLM_API_KEY`: Gemini API key, stored only in Supabase Edge Function secrets
+- `LLM_MODEL`: optional Gemini model override; defaults to `gemini-2.0-flash`
diff --git a/supabase/functions/_shared/llm/gemini.test.ts b/supabase/functions/_shared/llm/gemini.test.ts
new file mode 100644
index 0000000..be98725
--- /dev/null
+++ b/supabase/functions/_shared/llm/gemini.test.ts
@@ -0,0 +1,158 @@
+import { assertEquals, assertRejects } from 'jsr:@std/assert'
+import { createGeminiProvider } from './gemini.ts'
+
+Deno.test('Gemini provider maps messages, tools, and function calls', async () => {
+  const originalFetch = globalThis.fetch
+  let request: Request | undefined
+
+  globalThis.fetch = async (input, init) => {
+    request = input instanceof Request ? input : new Request(input, init)
+    return Response.json({
+      candidates: [
+        {
+          content: {
+            parts: [
+              { text: 'I can help.' },
+              {
+                functionCall: {
+                  id: 'gemini-call-123',
+                  name: 'lookup_balance',
+                  args: { accountId: 'acc-1' },
+                },
+              },
+            ],
+          },
+        },
+      ],
+    })
+  }
+
+  try {
+    const provider = createGeminiProvider('secret-key', 'gemini-2.0-flash')
+    const result = await provider.complete({
+      messages: [
+        { role: 'system', content: 'Be concise.' },
+        { role: 'user', content: 'What is my balance?' },
+        { role: 'assistant', content: 'I will look that up.' },
+        {
+          role: 'assistant',
+          content: '{"accountId":"acc-1"}',
+          toolCallId: 'gemini-call-123',
+          name: 'lookup_balance',
+        },
+        {
+          role: 'tool',
+          content: '{"balance": 42}',
+          toolCallId: 'gemini-call-123',
+          name: 'lookup_balance',
+        },
+      ],
+      tools: [
+        {
+          name: 'lookup_balance',
+          description: 'Looks up an account balance.',
+          parameters: {
+            type: 'object',
+            properties: { accountId: { type: 'string' } },
+            required: ['accountId'],
+          },
+        },
+      ],
+    })
+
+    assertEquals(result, {
+      assistantText: 'I can help.',
+      toolCalls: [{ id: 'gemini-call-123', name: 'lookup_balance', arguments: { accountId: 'acc-1' } }],
+    })
+    assertEquals(
+      request?.url,
+      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'
+    )
+    assertEquals(request?.headers.get('x-goog-api-key'), 'secret-key')
+    assertEquals(await request?.json(), {
+      systemInstruction: { parts: [{ text: 'Be concise.' }] },
+      contents: [
+        { role: 'user', parts: [{ text: 'What is my balance?' }] },
+        { role: 'model', parts: [{ text: 'I will look that up.' }] },
+        {
+          role: 'model',
+          parts: [
+            {
+              functionCall: {
+                id: 'gemini-call-123',
+                name: 'lookup_balance',
+                args: { accountId: 'acc-1' },
+              },
+            },
+          ],
+        },
+        {
+          role: 'user',
+          parts: [
+            {
+              functionResponse: {
+                id: 'gemini-call-123',
+                name: 'lookup_balance',
+                response: { balance: 42 },
+              },
+            },
+          ],
+        },
+      ],
+      tools: [
+        {
+          functionDeclarations: [
+            {
+              name: 'lookup_balance',
+              description: 'Looks up an account balance.',
+              parameters: {
+                type: 'object',
+                properties: { accountId: { type: 'string' } },
+                required: ['accountId'],
+              },
+            },
+          ],
+        },
+      ],
+    })
+  } finally {
+    globalThis.fetch = originalFetch
+  }
+})
+
+Deno.test('Gemini provider throws status without exposing its API key', async () => {
+  const originalFetch = globalThis.fetch
+  globalThis.fetch = async () => new Response('invalid key', { status: 401 })
+
+  try {
+    const provider = createGeminiProvider('secret-key', 'gemini-2.0-flash')
+    await assertRejects(
+      () => provider.complete({ messages: [{ role: 'user', content: 'Hello' }], tools: [] }),
+      Error,
+      'Gemini request failed with status 401'
+    )
+  } finally {
+    globalThis.fetch = originalFetch
+  }
+})
+
+Deno.test('Gemini provider redacts rejected-fetch errors', async () => {
+  const originalFetch = globalThis.fetch
+  globalThis.fetch = async () => {
+    throw new Error(
+      'Network failed for https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=secret-key'
+    )
+  }
+
+  try {
+    const provider = createGeminiProvider('secret-key', 'gemini-2.0-flash')
+    const error = await assertRejects(
+      () => provider.complete({ messages: [{ role: 'user', content: 'Hello' }], tools: [] }),
+      Error
+    )
+    assertEquals(error.message.includes('secret-key'), false)
+    assertEquals(error.message, 'Gemini request failed due to a transport error')
+  } finally {
+    globalThis.fetch = originalFetch
+  }
+})
diff --git a/supabase/functions/_shared/llm/gemini.ts b/supabase/functions/_shared/llm/gemini.ts
new file mode 100644
index 0000000..6b908ac
--- /dev/null
+++ b/supabase/functions/_shared/llm/gemini.ts
@@ -0,0 +1,163 @@
+import type { ChatMessage, CompleteResult, LlmProvider, ToolDef } from './types.ts'
+
+type GeminiPart =
+  | { text: string }
+  | { functionCall: { id?: string; name: string; args: Record<string, unknown> } }
+  | { functionResponse: { id?: string; name: string; response: Record<string, unknown> } }
+
+type GeminiContent = {
+  role?: 'user' | 'model'
+  parts: GeminiPart[]
+}
+
+type GeminiResponse = {
+  candidates?: Array<{
+    content?: {
+      parts?: Array<{
+        text?: unknown
+        functionCall?: {
+          name?: unknown
+          args?: unknown
+          id?: unknown
+        }
+      }>
+    }
+  }>
+}
+
+function parseObject(content: string): Record<string, unknown> | undefined {
+  try {
+    const parsed: unknown = JSON.parse(content)
+    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
+      return parsed as Record<string, unknown>
+    }
+  } catch {
+    // The caller may send a plain-text tool result.
+  }
+
+  return undefined
+}
+
+function toGeminiContent(message: ChatMessage): GeminiContent {
+  if (message.role === 'tool') {
+    return {
+      role: 'user',
+      parts: [
+        {
+          functionResponse: {
+            ...(message.toolCallId ? { id: message.toolCallId } : {}),
+            name: message.name ?? 'tool',
+            response: parseObject(message.content) ?? { content: message.content },
+          },
+        },
+      ],
+    }
+  }
+
+  if (message.role === 'assistant' && message.name) {
+    return {
+      role: 'model',
+      parts: [
+        {
+          functionCall: {
+            ...(message.toolCallId ? { id: message.toolCallId } : {}),
+            name: message.name,
+            args: parseObject(message.content) ?? {},
+          },
+        },
+      ],
+    }
+  }
+
+  return {
+    role: message.role === 'assistant' ? 'model' : 'user',
+    parts: [{ text: message.content }],
+  }
+}
+
+function toTools(tools: ToolDef[]) {
+  if (tools.length === 0) return undefined
+
+  return [
+    {
+      functionDeclarations: tools.map(({ name, description, parameters }) => ({
+        name,
+        description,
+        parameters,
+      })),
+    },
+  ]
+}
+
+export function createGeminiProvider(apiKey: string, model: string): LlmProvider {
+  return {
+    async complete({ messages, tools }): Promise<CompleteResult> {
+      const systemMessages = messages.filter((message) => message.role === 'system')
+      const contents = messages
+        .filter((message) => message.role !== 'system')
+        .map(toGeminiContent)
+      const body = {
+        ...(systemMessages.length > 0
+          ? { systemInstruction: { parts: systemMessages.map(({ content }) => ({ text: content })) } }
+          : {}),
+        contents,
+        ...(tools.length > 0 ? { tools: toTools(tools) } : {}),
+      }
+      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
+      let response: Response
+      try {
+        response = await fetch(url, {
+          method: 'POST',
+          headers: {
+            'Content-Type': 'application/json',
+            'x-goog-api-key': apiKey,
+          },
+          body: JSON.stringify(body),
+        })
+      } catch {
+        throw new Error('Gemini request failed due to a transport error')
+      }
+
+      if (!response.ok) {
+        throw new Error(`Gemini request failed with status ${response.status}`)
+      }
+
+      let payload: GeminiResponse
+      try {
+        payload = (await response.json()) as GeminiResponse
+      } catch {
+        throw new Error('Gemini response could not be parsed')
+      }
+      const parts = payload.candidates?.[0]?.content?.parts ?? []
+      const assistantText = parts
+        .filter((part): part is { text: string } => typeof part.text === 'string')
+        .map((part) => part.text)
+        .join('')
+      const toolCalls = parts.flatMap((part) => {
+        const functionCall = part.functionCall
+        if (!functionCall || typeof functionCall.name !== 'string') return []
+
+        return [
+          {
+            id: typeof functionCall.id === 'string' ? functionCall.id : '',
+            name: functionCall.name,
+            arguments:
+              functionCall.args !== null &&
+              typeof functionCall.args === 'object' &&
+              !Array.isArray(functionCall.args)
+                ? (functionCall.args as Record<string, unknown>)
+                : {},
+          },
+        ]
+      })
+      toolCalls.forEach((toolCall, index) => {
+        if (!toolCall.id) toolCall.id = `call_${toolCall.name}_${index}`
+      })
+
+      return {
+        ...(assistantText ? { assistantText } : {}),
+        toolCalls,
+      }
+    },
+  }
+}
diff --git a/supabase/functions/_shared/llm/provider.test.ts b/supabase/functions/_shared/llm/provider.test.ts
new file mode 100644
index 0000000..9fc842f
--- /dev/null
+++ b/supabase/functions/_shared/llm/provider.test.ts
@@ -0,0 +1,28 @@
+import { assertThrows } from 'jsr:@std/assert'
+import { getLlmProvider } from './provider.ts'
+
+function restoreEnv(name: string, value: string | undefined) {
+  if (value === undefined) {
+    Deno.env.delete(name)
+  } else {
+    Deno.env.set(name, value)
+  }
+}
+
+Deno.test('provider validates an unsupported provider before its API key', () => {
+  const previousProvider = Deno.env.get('LLM_PROVIDER')
+  const previousApiKey = Deno.env.get('LLM_API_KEY')
+  Deno.env.set('LLM_PROVIDER', 'unsupported')
+  Deno.env.delete('LLM_API_KEY')
+
+  try {
+    assertThrows(
+      () => getLlmProvider(),
+      Error,
+      'Unsupported LLM_PROVIDER: unsupported'
+    )
+  } finally {
+    restoreEnv('LLM_PROVIDER', previousProvider)
+    restoreEnv('LLM_API_KEY', previousApiKey)
+  }
+})
diff --git a/supabase/functions/_shared/llm/provider.ts b/supabase/functions/_shared/llm/provider.ts
new file mode 100644
index 0000000..75d48fb
--- /dev/null
+++ b/supabase/functions/_shared/llm/provider.ts
@@ -0,0 +1,15 @@
+import { createGeminiProvider } from './gemini.ts'
+import type { LlmProvider } from './types.ts'
+
+export function getLlmProvider(): LlmProvider {
+  const provider = (Deno.env.get('LLM_PROVIDER') ?? 'gemini').toLowerCase()
+  if (provider !== 'gemini') {
+    throw new Error(`Unsupported LLM_PROVIDER: ${provider}`)
+  }
+
+  const apiKey = Deno.env.get('LLM_API_KEY')
+  if (!apiKey) throw new Error('LLM_API_KEY is not set')
+
+  const model = Deno.env.get('LLM_MODEL') ?? 'gemini-2.0-flash'
+  return createGeminiProvider(apiKey, model)
+}
diff --git a/supabase/functions/_shared/llm/types.ts b/supabase/functions/_shared/llm/types.ts
new file mode 100644
index 0000000..c542ec9
--- /dev/null
+++ b/supabase/functions/_shared/llm/types.ts
@@ -0,0 +1,32 @@
+export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'
+
+export type ChatMessage = {
+  role: ChatRole
+  content: string
+  toolCallId?: string
+  name?: string
+}
+
+export type ToolDef = {
+  name: string
+  description: string
+  parameters: Record<string, unknown>
+}
+
+export type ToolCall = {
+  id: string
+  name: string
+  arguments: Record<string, unknown>
+}
+
+export type CompleteResult = {
+  assistantText?: string
+  toolCalls: ToolCall[]
+}
+
+export interface LlmProvider {
+  complete(input: {
+    messages: ChatMessage[]
+    tools: ToolDef[]
+  }): Promise<CompleteResult>
+}

```
