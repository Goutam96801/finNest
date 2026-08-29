# Review package Task 8
BASE: 94065ec4bbe21ac873155d09289ffce47abf6fe4
HEAD: 8548d904f4443456d547529ac1a7484665357168

## Commits
8548d90 feat: persist Fynn chats server-side with RLS


## Stat
 app/(tabs)/fynn.tsx                               |  49 ++++++++--
 lib/services/fynn.ts                              |  50 ++++++++++-
 supabase/functions/fynn-chat/index.test.ts        |  70 ++++++++++++++-
 supabase/functions/fynn-chat/index.ts             | 103 +++++++++++++++++++++-
 supabase/migrations/20260808130000_fynn_chats.sql |  89 +++++++++++++++++++
 5 files changed, 347 insertions(+), 14 deletions(-)


## Diff
```diff
diff --git a/app/(tabs)/fynn.tsx b/app/(tabs)/fynn.tsx
index db49402..261c44d 100644
--- a/app/(tabs)/fynn.tsx
+++ b/app/(tabs)/fynn.tsx
@@ -1,6 +1,12 @@
 import ScreenWrapper from '@/components/ScreenWrapper'
 import Typo from '@/components/Typo'
-import { confirmFynnProposal, sendFynnMessage } from '@/lib/services/fynn'
+import {
+  confirmFynnProposal,
+  type FynnStoredChat,
+  loadFynnChats,
+  sendFynnMessage,
+  updateFynnProposalMessage,
+} from '@/lib/services/fynn'
 import { LinearGradient } from 'expo-linear-gradient'
 import { ArrowUp, Heart, List, Plus, X } from 'phosphor-react-native'
 import React, { useEffect, useRef, useState } from 'react'
@@ -48,6 +54,28 @@ export default function Fynn() {
   const activeChat = chats.find((chat) => chat.id === activeChatId)
   const messages = activeChat?.messages ?? []
 
+  useEffect(() => {
+    const loadChats = async () => {
+      const response = await loadFynnChats()
+      if (!response.success || !response.data) return
+
+      setChats(response.data.map((chat: FynnStoredChat) => ({
+        id: chat.id,
+        title: chat.title,
+        messages: [...(chat.fynn_messages || [])].sort(
+          (a, b) => a.created_at.localeCompare(b.created_at)
+        ).map((message) => ({
+          id: message.id,
+          role: message.role,
+          text: message.content,
+          proposal: message.proposal_metadata || undefined,
+        })),
+      })))
+    }
+
+    void loadChats()
+  }, [])
+
   useEffect(() => {
     if (messages.length > 0) return
 
@@ -75,10 +103,6 @@ export default function Fynn() {
     const timestamp = Date.now()
     const userMessage: ChatMessage = { id: `${timestamp}-user`, role: 'user', text: cleanText }
     const chatId = activeChatId ?? `${timestamp}`
-    const history = messages.map((message) => ({
-      role: message.role,
-      content: message.text,
-    }))
 
     if (activeChatId) {
       setChats((current) => current.map((chat) => (
@@ -99,7 +123,8 @@ export default function Fynn() {
     setIsSending(true)
 
     try {
-      const response = await sendFynnMessage(cleanText, history)
+      const response = await sendFynnMessage(cleanText, activeChatId ?? undefined)
+      const persistedChatId = response.success ? response.data?.chatId : undefined
       const assistantMessage: ChatMessage = {
         id: `${timestamp}-assistant`,
         role: 'assistant',
@@ -119,9 +144,14 @@ export default function Fynn() {
       }
       setChats((current) => current.map((chat) => (
         chat.id === chatId
-          ? { ...chat, messages: [...chat.messages, assistantMessage] }
+          ? {
+              ...chat,
+              id: persistedChatId || chat.id,
+              messages: [...chat.messages, assistantMessage],
+            }
           : chat
       )))
+      if (persistedChatId && !activeChatId) setActiveChatId(persistedChatId)
     } catch {
       setChats((current) => current.map((chat) => (
         chat.id === chatId
@@ -157,6 +187,11 @@ export default function Fynn() {
       if (!response.success) return
 
       const status: 'accepted' | 'rejected' = action === 'accept' ? 'accepted' : 'rejected'
+      const chat = chats.find((item) => item.id === chatId)
+      const message = chat?.messages.find((item) => item.id === messageId)
+      if (message?.proposal) {
+        await updateFynnProposalMessage(messageId, { ...message.proposal, status })
+      }
       if (
         action === 'accept'
         && typeof response.data === 'object'
diff --git a/lib/services/fynn.ts b/lib/services/fynn.ts
index c68afca..293c4bc 100644
--- a/lib/services/fynn.ts
+++ b/lib/services/fynn.ts
@@ -2,15 +2,34 @@ import { supabase } from '@/lib/supabase'
 import { ResponseType } from '@/types'
 
 export type FynnChatResponse =
-  | { type: 'message'; text: string }
-  | { type: 'proposal'; proposalId: string; summary: string; preview: unknown; text?: string }
+  | { type: 'message'; text: string; chatId: string }
+  | { type: 'proposal'; proposalId: string; summary: string; preview: unknown; text?: string; chatId: string }
+
+export type FynnStoredMessage = {
+  id: string
+  role: 'assistant' | 'user'
+  content: string
+  created_at: string
+  proposal_metadata?: {
+    id: string
+    summary: string
+    preview: unknown
+    status: 'pending' | 'accepted' | 'rejected'
+  } | null
+}
+
+export type FynnStoredChat = {
+  id: string
+  title: string
+  fynn_messages?: FynnStoredMessage[]
+}
 
 export async function sendFynnMessage(
   message: string,
-  history: { role: 'user' | 'assistant'; content: string }[] = []
+  chatId?: string
 ): Promise<ResponseType & { data?: FynnChatResponse }> {
   const { data, error } = await supabase.functions.invoke('fynn-chat', {
-    body: { message, history },
+    body: { message, ...(chatId ? { chat_id: chatId } : {}) },
   })
 
   if (error) return { success: false, msg: error.message }
@@ -18,6 +37,29 @@ export async function sendFynnMessage(
   return { success: true, data: data as FynnChatResponse }
 }
 
+export async function loadFynnChats(): Promise<ResponseType & { data?: FynnStoredChat[] }> {
+  const { data, error } = await supabase
+    .from('fynn_chats')
+    .select('id, title, fynn_messages(id, role, content, proposal_metadata, created_at)')
+    .order('updated_at', { ascending: false })
+
+  if (error) return { success: false, msg: error.message }
+  return { success: true, data: (data || []) as FynnStoredChat[] }
+}
+
+export async function updateFynnProposalMessage(
+  messageId: string,
+  proposalMetadata: NonNullable<FynnStoredMessage['proposal_metadata']>
+): Promise<ResponseType> {
+  const { error } = await supabase
+    .from('fynn_messages')
+    .update({ proposal_metadata: proposalMetadata })
+    .eq('id', messageId)
+
+  if (error) return { success: false, msg: error.message }
+  return { success: true }
+}
+
 export async function confirmFynnProposal(
   proposalId: string,
   action: 'accept' | 'reject'
diff --git a/supabase/functions/fynn-chat/index.test.ts b/supabase/functions/fynn-chat/index.test.ts
index 046966b..b442c1a 100644
--- a/supabase/functions/fynn-chat/index.test.ts
+++ b/supabase/functions/fynn-chat/index.test.ts
@@ -1,6 +1,15 @@
 import { assertEquals, assertStringIncludes } from 'jsr:@std/assert'
 import { createFynnChatHandler } from './index.ts'
 
+function testPersistence() {
+  return {
+    createChat: async () => 'chat-1',
+    requireChat: async () => {},
+    listMessages: async () => [],
+    saveMessage: async () => {},
+  }
+}
+
 Deno.test('Fynn chat executes read tools and returns the follow-up message', async () => {
   const providerInputs: Array<{
     messages: Array<{
@@ -32,6 +41,7 @@ Deno.test('Fynn chat executes read tools and returns the follow-up message', asy
       assertEquals(userId, 'user-1')
       return { ok: true, result: [{ name: 'Checking', balance: 12500 }] }
     },
+    persistence: testPersistence(),
   })
 
   const response = await handler(
@@ -42,7 +52,7 @@ Deno.test('Fynn chat executes read tools and returns the follow-up message', asy
   )
 
   assertEquals(response.status, 200)
-  assertEquals(await response.json(), { type: 'message', text: 'You have one account.' })
+  assertEquals(await response.json(), { type: 'message', text: 'You have one account.', chatId: 'chat-1' })
   assertEquals(providerInputs.length, 2)
   assertStringIncludes(providerInputs[0].messages[0].content, 'Never invent balances')
   assertEquals(providerInputs[1].messages.at(-1), {
@@ -77,6 +87,7 @@ Deno.test('Fynn chat returns a proposal immediately after a propose tool succeed
         preview: { amount: 50, type: 'expense' },
       },
     }),
+    persistence: testPersistence(),
   })
 
   const response = await handler(
@@ -92,6 +103,8 @@ Deno.test('Fynn chat returns a proposal immediately after a propose tool succeed
     proposalId: 'proposal-1',
     summary: 'Add a Ôé╣50 Dining expense.',
     preview: { amount: 50, type: 'expense' },
+    text: 'Please confirm this change.',
+    chatId: 'chat-1',
   })
   assertEquals(completions, 1)
 })
@@ -109,6 +122,7 @@ Deno.test('Fynn chat stops after six tool iterations', async () => {
       },
     }),
     executeTool: async () => ({ ok: true, result: [] }),
+    persistence: testPersistence(),
   })
 
   const response = await handler(
@@ -122,3 +136,57 @@ Deno.test('Fynn chat stops after six tool iterations', async () => {
   assertEquals(response.status, 400)
   assertEquals(await response.json(), { error: 'Unable to complete chat response' })
 })
+
+Deno.test('Fynn chat creates a chat and persists the completed turn', async () => {
+  const calls: Array<{ table: string; action: string; payload?: unknown }> = []
+  const userClient = {
+    from: (table: string) => ({
+      insert: (payload: unknown) => {
+        calls.push({ table, action: 'insert', payload })
+        return {
+          select: () => ({
+            single: async () => ({ data: { id: 'chat-1' }, error: null }),
+          }),
+        }
+      },
+    }),
+  }
+  const handler = createFynnChatHandler({
+    getAuthedUserClient: async () => ({ user: { id: 'user-1' }, userClient }),
+    getLlmProvider: () => ({
+      complete: async () => ({ assistantText: 'Your balance is Ôé╣100.', toolCalls: [] }),
+    }),
+    executeTool: async () => ({ ok: true, result: [] }),
+  })
+
+  const response = await handler(
+    new Request('http://localhost/fynn-chat', {
+      method: 'POST',
+      body: JSON.stringify({ message: 'What is my balance?' }),
+    })
+  )
+
+  assertEquals(response.status, 200)
+  assertEquals(await response.json(), {
+    type: 'message',
+    text: 'Your balance is Ôé╣100.',
+    chatId: 'chat-1',
+  })
+  assertEquals(calls, [
+    {
+      table: 'fynn_chats',
+      action: 'insert',
+      payload: { user_id: 'user-1', title: 'What is my balance?' },
+    },
+    {
+      table: 'fynn_messages',
+      action: 'insert',
+      payload: { chat_id: 'chat-1', user_id: 'user-1', role: 'user', content: 'What is my balance?' },
+    },
+    {
+      table: 'fynn_messages',
+      action: 'insert',
+      payload: { chat_id: 'chat-1', user_id: 'user-1', role: 'assistant', content: 'Your balance is Ôé╣100.' },
+    },
+  ])
+})
diff --git a/supabase/functions/fynn-chat/index.ts b/supabase/functions/fynn-chat/index.ts
index 41af5fa..364e355 100644
--- a/supabase/functions/fynn-chat/index.ts
+++ b/supabase/functions/fynn-chat/index.ts
@@ -15,6 +15,19 @@ type ProposalResult = {
   preview: unknown
 }
 
+type ChatPersistence = {
+  createChat: (userClient: any, userId: string, title: string) => Promise<string>
+  requireChat: (userClient: any, chatId: string) => Promise<void>
+  listMessages: (userClient: any, chatId: string) => Promise<ChatMessage[]>
+  saveMessage: (userClient: any, input: {
+    chatId: string
+    userId: string
+    role: 'user' | 'assistant'
+    content: string
+    proposalMetadata?: unknown
+  }) => Promise<void>
+}
+
 type FynnChatDependencies = {
   getAuthedUserClient: (req: Request) => Promise<{
     user: { id: string }
@@ -27,10 +40,54 @@ type FynnChatDependencies = {
     userId: string
     userClient: any
   }) => Promise<ToolResult>
+  persistence?: ChatPersistence
 }
 
 const systemPrompt = `You are Fynn, a helpful personal finance assistant. Use the available tools to answer questions about this user's money data. Never invent balances, transactions, subscriptions, or other financial data. Only use the listed tools, and clearly say when the data is unavailable.`
 
+const persistence: ChatPersistence = {
+  async createChat(userClient, userId, title) {
+    const { data, error } = await userClient
+      .from('fynn_chats')
+      .insert({ user_id: userId, title })
+      .select('id')
+      .single()
+    if (error || !data?.id) throw new Error(error?.message || 'Unable to create chat')
+    return data.id
+  },
+  async requireChat(userClient, chatId) {
+    const { data, error } = await userClient
+      .from('fynn_chats')
+      .select('id')
+      .eq('id', chatId)
+      .single()
+    if (error || !data) throw new Error(error?.message || 'Chat not found')
+  },
+  async listMessages(userClient, chatId) {
+    const { data, error } = await userClient
+      .from('fynn_messages')
+      .select('role, content')
+      .eq('chat_id', chatId)
+      .order('created_at', { ascending: true })
+    if (error) throw new Error(error.message)
+    return (data || []).flatMap((message: { role: unknown; content: unknown }): ChatMessage[] => (
+      (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string'
+        ? [{ role: message.role, content: message.content }]
+        : []
+    ))
+  },
+  async saveMessage(userClient, { chatId, userId, role, content, proposalMetadata }) {
+    const { error } = await userClient.from('fynn_messages').insert({
+      chat_id: chatId,
+      user_id: userId,
+      role,
+      content,
+      ...(proposalMetadata === undefined ? {} : { proposal_metadata: proposalMetadata }),
+    })
+    if (error) throw new Error(error.message)
+  },
+}
+
 function proposalResult(value: unknown): ProposalResult | null {
   if (!value || typeof value !== 'object') return null
   const result = value as Record<string, unknown>
@@ -76,8 +133,11 @@ export function createFynnChatHandler(
     getAuthedUserClient,
     getLlmProvider,
     executeTool,
+    persistence,
   }
 ) {
+  const persistenceLayer = dependencies.persistence ?? persistence
+
   return async (req: Request): Promise<Response> => {
     if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
     if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
@@ -85,8 +145,26 @@ export function createFynnChatHandler(
     try {
       const { user, userClient } = await dependencies.getAuthedUserClient(req)
       const body = await req.json().catch(() => ({}))
-      const messages = parseMessages(body.history, body.message)
+      if (typeof body.message !== 'string' || !body.message.trim()) {
+        return json({ error: 'Message is required' }, 400)
+      }
+      const requestedChatId = typeof body.chat_id === 'string' && body.chat_id.trim()
+        ? body.chat_id.trim()
+        : null
+      const chatId = requestedChatId
+        ? (await persistenceLayer.requireChat(userClient, requestedChatId), requestedChatId)
+        : await persistenceLayer.createChat(userClient, user.id, String(body.message || '').trim())
+      const history = requestedChatId
+        ? await persistenceLayer.listMessages(userClient, chatId)
+        : []
+      const messages = parseMessages(history, body.message)
       if (!messages) return json({ error: 'Message is required' }, 400)
+      await persistenceLayer.saveMessage(userClient, {
+        chatId,
+        userId: user.id,
+        role: 'user',
+        content: messages.at(-1)!.content,
+      })
 
       const provider = dependencies.getLlmProvider()
       for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
@@ -95,7 +173,13 @@ export function createFynnChatHandler(
           if (!completion.assistantText?.trim()) {
             throw new Error('Unable to complete chat response')
           }
-          return json({ type: 'message', text: completion.assistantText })
+          await persistenceLayer.saveMessage(userClient, {
+            chatId,
+            userId: user.id,
+            role: 'assistant',
+            content: completion.assistantText,
+          })
+          return json({ type: 'message', text: completion.assistantText, chatId })
         }
 
         for (const toolCall of completion.toolCalls) {
@@ -115,11 +199,26 @@ export function createFynnChatHandler(
           if (result.ok) {
             const proposal = proposalResult(result.result)
             if (proposal) {
+              const text = 'Please confirm this change.'
+              await persistenceLayer.saveMessage(userClient, {
+                chatId,
+                userId: user.id,
+                role: 'assistant',
+                content: text,
+                proposalMetadata: {
+                  id: proposal.proposal_id,
+                  summary: proposal.summary,
+                  preview: proposal.preview,
+                  status: 'pending',
+                },
+              })
               return json({
                 type: 'proposal',
                 proposalId: proposal.proposal_id,
                 summary: proposal.summary,
                 preview: proposal.preview,
+                text,
+                chatId,
               })
             }
           }
diff --git a/supabase/migrations/20260808130000_fynn_chats.sql b/supabase/migrations/20260808130000_fynn_chats.sql
new file mode 100644
index 0000000..6e6eb5a
--- /dev/null
+++ b/supabase/migrations/20260808130000_fynn_chats.sql
@@ -0,0 +1,89 @@
+CREATE TABLE IF NOT EXISTS public.fynn_chats (
+  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
+  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
+  title text NOT NULL,
+  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
+  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
+);
+
+CREATE UNIQUE INDEX IF NOT EXISTS fynn_chats_id_user_id_idx
+  ON public.fynn_chats (id, user_id);
+
+CREATE INDEX IF NOT EXISTS fynn_chats_user_updated_idx
+  ON public.fynn_chats (user_id, updated_at DESC);
+
+CREATE OR REPLACE TRIGGER fynn_chats_updated_at
+  BEFORE UPDATE ON public.fynn_chats
+  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
+
+CREATE TABLE IF NOT EXISTS public.fynn_messages (
+  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
+  chat_id uuid NOT NULL,
+  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
+  role text NOT NULL CHECK (role IN ('user', 'assistant')),
+  content text NOT NULL,
+  proposal_metadata jsonb,
+  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
+  CONSTRAINT fynn_messages_chat_user_fk
+    FOREIGN KEY (chat_id, user_id)
+    REFERENCES public.fynn_chats (id, user_id)
+    ON DELETE CASCADE
+);
+
+CREATE INDEX IF NOT EXISTS fynn_messages_chat_created_idx
+  ON public.fynn_messages (chat_id, created_at ASC);
+
+CREATE OR REPLACE FUNCTION public.touch_fynn_chat_updated_at()
+RETURNS trigger
+LANGUAGE plpgsql
+AS $$
+BEGIN
+  UPDATE public.fynn_chats
+  SET updated_at = timezone('utc', now())
+  WHERE id = NEW.chat_id AND user_id = NEW.user_id;
+  RETURN NEW;
+END;
+$$;
+
+CREATE OR REPLACE TRIGGER fynn_messages_touch_chat
+  AFTER INSERT ON public.fynn_messages
+  FOR EACH ROW EXECUTE FUNCTION public.touch_fynn_chat_updated_at();
+
+ALTER TABLE public.fynn_chats ENABLE ROW LEVEL SECURITY;
+ALTER TABLE public.fynn_messages ENABLE ROW LEVEL SECURITY;
+
+CREATE POLICY "Users can view own fynn chats"
+  ON public.fynn_chats FOR SELECT
+  USING (auth.uid() = user_id);
+
+CREATE POLICY "Users can insert own fynn chats"
+  ON public.fynn_chats FOR INSERT
+  WITH CHECK (auth.uid() = user_id);
+
+CREATE POLICY "Users can update own fynn chats"
+  ON public.fynn_chats FOR UPDATE
+  USING (auth.uid() = user_id)
+  WITH CHECK (auth.uid() = user_id);
+
+CREATE POLICY "Users can delete own fynn chats"
+  ON public.fynn_chats FOR DELETE
+  USING (auth.uid() = user_id);
+
+CREATE POLICY "Users can view own fynn messages"
+  ON public.fynn_messages FOR SELECT
+  USING (auth.uid() = user_id);
+
+CREATE POLICY "Users can insert own fynn messages"
+  ON public.fynn_messages FOR INSERT
+  WITH CHECK (auth.uid() = user_id);
+
+CREATE POLICY "Users can update own fynn messages"
+  ON public.fynn_messages FOR UPDATE
+  USING (auth.uid() = user_id)
+  WITH CHECK (auth.uid() = user_id);
+
+CREATE POLICY "Users can delete own fynn messages"
+  ON public.fynn_messages FOR DELETE
+  USING (auth.uid() = user_id);
+
+GRANT ALL ON TABLE public.fynn_chats, public.fynn_messages TO anon, authenticated, service_role;

```
