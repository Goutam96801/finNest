# Review package Task 9
BASE: 2928c44a984f66e6c6bff948aef6b86312c83448
HEAD: 9fed4d94c5758f67c9a285fcdf340a749afb9b7a

## Commits
9fed4d9 feat: add env-swappable LLM providers and Fynn hardening


## Stat
 docs/superpowers/settings-deploy-notes.md       |  32 ++++++
 supabase/functions/_shared/llm/openai.test.ts   | 145 ++++++++++++++++++++++++
 supabase/functions/_shared/llm/openai.ts        | 120 ++++++++++++++++++++
 supabase/functions/_shared/llm/provider.test.ts |  31 ++++-
 supabase/functions/_shared/llm/provider.ts      |  10 +-
 supabase/functions/fynn-chat/index.test.ts      |  39 +++++++
 supabase/functions/fynn-chat/index.ts           |  20 ++++
 7 files changed, 393 insertions(+), 4 deletions(-)


## Diff
```diff
diff --git a/docs/superpowers/settings-deploy-notes.md b/docs/superpowers/settings-deploy-notes.md
index 6a85ce5..0ab8b17 100644
--- a/docs/superpowers/settings-deploy-notes.md
+++ b/docs/superpowers/settings-deploy-notes.md
@@ -10,8 +10,10 @@ Includes settings columns, feedback, `data_exports`, and private `exports` stora
 ## Edge functions
 ```bash
 npx supabase functions deploy export-transactions
 npx supabase functions deploy delete-account
+npx supabase functions deploy fynn-chat
+npx supabase functions deploy fynn-confirm
 ```
 
 Export: CSV/PDF ÔåÆ Storage `exports/{userId}/ÔÇª` (no email).
 
@@ -26,4 +28,34 @@ npx supabase secrets set LLM_PROVIDER=gemini LLM_API_KEY=YOUR_KEY LLM_MODEL=gemi
 
 - `LLM_PROVIDER`: `gemini` (default)
 - `LLM_API_KEY`: Gemini API key, stored only in Supabase Edge Function secrets
 - `LLM_MODEL`: optional Gemini model override; defaults to `gemini-2.0-flash`
+
+### OpenAI provider swap
+
+No Expo rebuild is needed to swap the Edge Function provider. Set the OpenAI key and
+model, then deploy the Fynn functions if the latest code is not already deployed:
+
+```bash
+npx supabase secrets set LLM_PROVIDER=openai LLM_API_KEY=YOUR_OPENAI_KEY LLM_MODEL=gpt-4o-mini
+npx supabase functions deploy fynn-chat
+npx supabase functions deploy fynn-confirm
+```
+
+With a logged-in test user, smoke test one read turn (for example, ÔÇ£List my
+accountsÔÇØ) and one confirmed write (for example, propose a small transaction,
+tap Accept, and verify the row). Switch back to the Gemini default after the
+test:
+
+```bash
+npx supabase secrets set LLM_PROVIDER=gemini LLM_API_KEY=YOUR_GEMINI_KEY LLM_MODEL=gemini-2.0-flash
+```
+
+### Fynn hardening limits
+
+- A chat turn performs at most 6 LLM/tool iterations.
+- List tools are capped at 25 records.
+- Mutation proposals expire after 10 minutes.
+- `fynn-chat` allows 20 valid turns per user per rolling minute. This limiter is
+  an in-memory `Map` per Edge isolate, so it is best-effort and does not enforce
+  a shared global limit across isolates or deployments. Replace it with a shared
+  store before relying on it for abuse prevention at scale.
diff --git a/supabase/functions/_shared/llm/openai.test.ts b/supabase/functions/_shared/llm/openai.test.ts
new file mode 100644
index 0000000..5e4b0e6
--- /dev/null
+++ b/supabase/functions/_shared/llm/openai.test.ts
@@ -0,0 +1,145 @@
+import { assertEquals, assertRejects } from 'jsr:@std/assert'
+import { createOpenAiProvider } from './openai.ts'
+
+Deno.test('OpenAI provider maps messages, tools, and tool calls', async () => {
+  const originalFetch = globalThis.fetch
+  let request: Request | undefined
+
+  globalThis.fetch = async (input, init) => {
+    request = input instanceof Request ? input : new Request(input, init)
+    return Response.json({
+      choices: [{
+        message: {
+          content: 'I can help.',
+          tool_calls: [{
+            id: 'openai-call-123',
+            type: 'function',
+            function: {
+              name: 'lookup_balance',
+              arguments: '{"accountId":"acc-1"}',
+            },
+          }],
+        },
+      }],
+    })
+  }
+
+  try {
+    const provider = createOpenAiProvider('secret-key', 'gpt-4o-mini')
+    const result = await provider.complete({
+      messages: [
+        { role: 'system', content: 'Be concise.' },
+        { role: 'user', content: 'What is my balance?' },
+        { role: 'assistant', content: 'I will look that up.' },
+        {
+          role: 'assistant',
+          content: '{"accountId":"acc-1"}',
+          toolCallId: 'openai-call-123',
+          name: 'lookup_balance',
+        },
+        {
+          role: 'tool',
+          content: '{"balance":42}',
+          toolCallId: 'openai-call-123',
+          name: 'lookup_balance',
+        },
+      ],
+      tools: [{
+        name: 'lookup_balance',
+        description: 'Looks up an account balance.',
+        parameters: {
+          type: 'object',
+          properties: { accountId: { type: 'string' } },
+          required: ['accountId'],
+        },
+      }],
+    })
+
+    assertEquals(result, {
+      assistantText: 'I can help.',
+      toolCalls: [{ id: 'openai-call-123', name: 'lookup_balance', arguments: { accountId: 'acc-1' } }],
+    })
+    assertEquals(request?.url, 'https://api.openai.com/v1/chat/completions')
+    assertEquals(request?.headers.get('authorization'), 'Bearer secret-key')
+    assertEquals(await request?.json(), {
+      model: 'gpt-4o-mini',
+      messages: [
+        { role: 'system', content: 'Be concise.' },
+        { role: 'user', content: 'What is my balance?' },
+        { role: 'assistant', content: 'I will look that up.' },
+        {
+          role: 'assistant',
+          content: null,
+          tool_calls: [{
+            id: 'openai-call-123',
+            type: 'function',
+            function: { name: 'lookup_balance', arguments: '{"accountId":"acc-1"}' },
+          }],
+        },
+        {
+          role: 'tool',
+          tool_call_id: 'openai-call-123',
+          content: '{"balance":42}',
+        },
+      ],
+      tools: [{
+        type: 'function',
+        function: {
+          name: 'lookup_balance',
+          description: 'Looks up an account balance.',
+          parameters: {
+            type: 'object',
+            properties: { accountId: { type: 'string' } },
+            required: ['accountId'],
+          },
+        },
+      }],
+    })
+  } finally {
+    globalThis.fetch = originalFetch
+  }
+})
+
+Deno.test('OpenAI provider uses an empty object for malformed tool arguments', async () => {
+  const originalFetch = globalThis.fetch
+  globalThis.fetch = async () => Response.json({
+    choices: [{
+      message: {
+        tool_calls: [{
+          id: 'openai-call-123',
+          type: 'function',
+          function: { name: 'lookup_balance', arguments: '{not json}' },
+        }],
+      },
+    }],
+  })
+
+  try {
+    const provider = createOpenAiProvider('secret-key', 'gpt-4o-mini')
+    assertEquals(
+      await provider.complete({ messages: [{ role: 'user', content: 'Hello' }], tools: [] }),
+      { toolCalls: [{ id: 'openai-call-123', name: 'lookup_balance', arguments: {} }] }
+    )
+  } finally {
+    globalThis.fetch = originalFetch
+  }
+})
+
+Deno.test('OpenAI provider redacts rejected-fetch errors', async () => {
+  const originalFetch = globalThis.fetch
+  globalThis.fetch = async () => {
+    throw new Error('Network failed for https://api.openai.com/v1/chat/completions?api_key=secret-key')
+  }
+
+  try {
+    const provider = createOpenAiProvider('secret-key', 'gpt-4o-mini')
+    const error = await assertRejects(
+      () => provider.complete({ messages: [{ role: 'user', content: 'Hello' }], tools: [] }),
+      Error
+    )
+    assertEquals(error.message.includes('secret-key'), false)
+    assertEquals(error.message, 'OpenAI request failed due to a transport error')
+  } finally {
+    globalThis.fetch = originalFetch
+  }
+})
diff --git a/supabase/functions/_shared/llm/openai.ts b/supabase/functions/_shared/llm/openai.ts
new file mode 100644
index 0000000..b95c690
--- /dev/null
+++ b/supabase/functions/_shared/llm/openai.ts
@@ -0,0 +1,120 @@
+import type { ChatMessage, CompleteResult, LlmProvider, ToolDef } from './types.ts'
+
+type OpenAiToolCall = {
+  id?: unknown
+  function?: {
+    name?: unknown
+    arguments?: unknown
+  }
+}
+
+type OpenAiResponse = {
+  choices?: Array<{
+    message?: {
+      content?: unknown
+      tool_calls?: OpenAiToolCall[]
+    }
+  }>
+}
+
+function parseArguments(value: unknown): Record<string, unknown> {
+  if (typeof value !== 'string') return {}
+
+  try {
+    const parsed: unknown = JSON.parse(value)
+    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
+      ? parsed as Record<string, unknown>
+      : {}
+  } catch {
+    return {}
+  }
+}
+
+function toOpenAiMessage(message: ChatMessage) {
+  if (message.role === 'tool') {
+    return {
+      role: 'tool',
+      tool_call_id: message.toolCallId ?? '',
+      content: message.content,
+    }
+  }
+
+  if (message.role === 'assistant' && message.name) {
+    return {
+      role: 'assistant',
+      content: null,
+      tool_calls: [{
+        id: message.toolCallId ?? '',
+        type: 'function',
+        function: {
+          name: message.name,
+          arguments: message.content,
+        },
+      }],
+    }
+  }
+
+  return { role: message.role, content: message.content }
+}
+
+function toTools(tools: ToolDef[]) {
+  return tools.map(({ name, description, parameters }) => ({
+    type: 'function',
+    function: { name, description, parameters },
+  }))
+}
+
+export function createOpenAiProvider(apiKey: string, model: string): LlmProvider {
+  return {
+    async complete({ messages, tools }): Promise<CompleteResult> {
+      let response: Response
+      try {
+        response = await fetch('https://api.openai.com/v1/chat/completions', {
+          method: 'POST',
+          headers: {
+            'Content-Type': 'application/json',
+            Authorization: `Bearer ${apiKey}`,
+          },
+          body: JSON.stringify({
+            model,
+            messages: messages.map(toOpenAiMessage),
+            ...(tools.length > 0 ? { tools: toTools(tools) } : {}),
+          }),
+        })
+      } catch {
+        throw new Error('OpenAI request failed due to a transport error')
+      }
+
+      if (!response.ok) {
+        throw new Error(`OpenAI request failed with status ${response.status}`)
+      }
+
+      let payload: OpenAiResponse
+      try {
+        payload = await response.json() as OpenAiResponse
+      } catch {
+        throw new Error('OpenAI response could not be parsed')
+      }
+
+      const message = payload.choices?.[0]?.message
+      const toolCalls = (message?.tool_calls ?? []).flatMap((toolCall, index) => {
+        const name = toolCall.function?.name
+        if (typeof name !== 'string') return []
+
+        return [{
+          id: typeof toolCall.id === 'string' && toolCall.id
+            ? toolCall.id
+            : `call_${name}_${index}`,
+          name,
+          arguments: parseArguments(toolCall.function?.arguments),
+        }]
+      })
+      const assistantText = typeof message?.content === 'string' ? message.content : undefined
+
+      return {
+        ...(assistantText ? { assistantText } : {}),
+        toolCalls,
+      }
+    },
+  }
+}
diff --git a/supabase/functions/_shared/llm/provider.test.ts b/supabase/functions/_shared/llm/provider.test.ts
index 9fc842f..da74735 100644
--- a/supabase/functions/_shared/llm/provider.test.ts
+++ b/supabase/functions/_shared/llm/provider.test.ts
@@ -1,5 +1,5 @@
-import { assertThrows } from 'jsr:@std/assert'
+import { assertEquals, assertThrows } from 'jsr:@std/assert'
 import { getLlmProvider } from './provider.ts'
 
 function restoreEnv(name: string, value: string | undefined) {
   if (value === undefined) {
@@ -25,4 +25,33 @@ Deno.test('provider validates an unsupported provider before its API key', () =>
     restoreEnv('LLM_PROVIDER', previousProvider)
     restoreEnv('LLM_API_KEY', previousApiKey)
   }
 })
+
+Deno.test('provider selects OpenAI from LLM_PROVIDER', async () => {
+  const previousProvider = Deno.env.get('LLM_PROVIDER')
+  const previousApiKey = Deno.env.get('LLM_API_KEY')
+  const previousModel = Deno.env.get('LLM_MODEL')
+  const originalFetch = globalThis.fetch
+  let request: Request | undefined
+  Deno.env.set('LLM_PROVIDER', 'openai')
+  Deno.env.set('LLM_API_KEY', 'secret-key')
+  Deno.env.set('LLM_MODEL', 'gpt-4o-mini')
+  globalThis.fetch = async (input, init) => {
+    request = input instanceof Request ? input : new Request(input, init)
+    return Response.json({ choices: [{ message: { content: 'Hello' } }] })
+  }
+
+  try {
+    const result = await getLlmProvider().complete({
+      messages: [{ role: 'user', content: 'Hello' }],
+      tools: [],
+    })
+    assertEquals(result, { assistantText: 'Hello', toolCalls: [] })
+    assertEquals(request?.url, 'https://api.openai.com/v1/chat/completions')
+  } finally {
+    globalThis.fetch = originalFetch
+    restoreEnv('LLM_PROVIDER', previousProvider)
+    restoreEnv('LLM_API_KEY', previousApiKey)
+    restoreEnv('LLM_MODEL', previousModel)
+  }
+})
diff --git a/supabase/functions/_shared/llm/provider.ts b/supabase/functions/_shared/llm/provider.ts
index 75d48fb..62326ea 100644
--- a/supabase/functions/_shared/llm/provider.ts
+++ b/supabase/functions/_shared/llm/provider.ts
@@ -1,15 +1,19 @@
 import { createGeminiProvider } from './gemini.ts'
+import { createOpenAiProvider } from './openai.ts'
 import type { LlmProvider } from './types.ts'
 
 export function getLlmProvider(): LlmProvider {
   const provider = (Deno.env.get('LLM_PROVIDER') ?? 'gemini').toLowerCase()
-  if (provider !== 'gemini') {
+  if (provider !== 'gemini' && provider !== 'openai') {
     throw new Error(`Unsupported LLM_PROVIDER: ${provider}`)
   }
 
   const apiKey = Deno.env.get('LLM_API_KEY')
   if (!apiKey) throw new Error('LLM_API_KEY is not set')
 
-  const model = Deno.env.get('LLM_MODEL') ?? 'gemini-2.0-flash'
-  return createGeminiProvider(apiKey, model)
+  if (provider === 'openai') {
+    return createOpenAiProvider(apiKey, Deno.env.get('LLM_MODEL') ?? 'gpt-4o-mini')
+  }
+
+  return createGeminiProvider(apiKey, Deno.env.get('LLM_MODEL') ?? 'gemini-2.0-flash')
 }
diff --git a/supabase/functions/fynn-chat/index.test.ts b/supabase/functions/fynn-chat/index.test.ts
index a4e6432..419cac7 100644
--- a/supabase/functions/fynn-chat/index.test.ts
+++ b/supabase/functions/fynn-chat/index.test.ts
@@ -200,4 +200,43 @@ Deno.test('Fynn chat creates a chat and persists the completed turn', async () =
       payload: { chat_id: 'chat-1', user_id: 'user-1', role: 'assistant', content: 'Your balance is Ôé╣100.' },
     },
   ])
 })
+
+Deno.test('Fynn chat limits each user to 20 turns per minute', async () => {
+  let completions = 0
+  const handler = createFynnChatHandler({
+    getAuthedUserClient: async () => ({
+      user: { id: 'rate-limited-user' },
+      userClient: {},
+    }),
+    getLlmProvider: () => ({
+      complete: async () => {
+        completions += 1
+        return { assistantText: 'Hello.', toolCalls: [] }
+      },
+    }),
+    executeTool: async () => ({ ok: true, result: [] }),
+    persistence: testPersistence(),
+  })
+
+  for (let turn = 0; turn < 20; turn += 1) {
+    const response = await handler(
+      new Request('http://localhost/fynn-chat', {
+        method: 'POST',
+        body: JSON.stringify({ message: `Turn ${turn}` }),
+      })
+    )
+    assertEquals(response.status, 200)
+  }
+
+  const response = await handler(
+    new Request('http://localhost/fynn-chat', {
+      method: 'POST',
+      body: JSON.stringify({ message: 'One too many' }),
+    })
+  )
+
+  assertEquals(completions, 20)
+  assertEquals(response.status, 429)
+  assertEquals(await response.json(), { error: 'Too many Fynn chat requests. Try again later.' })
+})
diff --git a/supabase/functions/fynn-chat/index.ts b/supabase/functions/fynn-chat/index.ts
index 1389d2e..f3a0e41 100644
--- a/supabase/functions/fynn-chat/index.ts
+++ b/supabase/functions/fynn-chat/index.ts
@@ -5,8 +5,25 @@ import type { ChatMessage, LlmProvider } from '../_shared/llm/types.ts'
 import { TOOL_DEFS } from '../_shared/tools/catalog.ts'
 import { executeTool } from '../_shared/tools/executor.ts'
 
 const MAX_TOOL_ITERATIONS = 6
+const RATE_LIMIT_WINDOW_MS = 60 * 1000
+const MAX_REQUESTS_PER_USER_PER_WINDOW = 20
+const requestTimesByUser = new Map<string, number[]>()
+
+function isRateLimited(userId: string, now = Date.now()): boolean {
+  const requestTimes = (requestTimesByUser.get(userId) ?? [])
+    .filter((requestTime) => requestTime > now - RATE_LIMIT_WINDOW_MS)
+
+  if (requestTimes.length >= MAX_REQUESTS_PER_USER_PER_WINDOW) {
+    requestTimesByUser.set(userId, requestTimes)
+    return true
+  }
+
+  requestTimes.push(now)
+  requestTimesByUser.set(userId, requestTimes)
+  return false
+}
 
 type ToolResult = { ok: true; result: unknown } | { ok: false; error: string }
 
 type ProposalResult = {
@@ -148,8 +165,11 @@ export function createFynnChatHandler(
       const body = await req.json().catch(() => ({}))
       if (typeof body.message !== 'string' || !body.message.trim()) {
         return json({ error: 'Message is required' }, 400)
       }
+      if (isRateLimited(user.id)) {
+        return json({ error: 'Too many Fynn chat requests. Try again later.' }, 429)
+      }
       const requestedChatId = typeof body.chat_id === 'string' && body.chat_id.trim()
         ? body.chat_id.trim()
         : null
       const chatId = requestedChatId

```
