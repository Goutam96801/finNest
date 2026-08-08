# Review package Task 5
BASE: c1336b9fe74bb82a9092d9bb92bd14c414440850
HEAD: 8a04bd3074b0099ad5d9e70b86d910275e30aa60

## Commits
8a04bd3 feat: wire Fynn chat to Edge LLM with read tools


## Stat
 app/(tabs)/_layout.tsx                     |   5 +-
 app/(tabs)/fynn.tsx                        | 260 +++++++++++++++++++++++++++++
 components/CustomTabs.tsx                  |   7 +
 lib/services/fynn.ts                       |  19 +++
 supabase/functions/fynn-chat/index.test.ts |  74 ++++++++
 supabase/functions/fynn-chat/index.ts      | 120 +++++++++++++
 6 files changed, 483 insertions(+), 2 deletions(-)


## Diff
```diff
diff --git a/app/(tabs)/_layout.tsx b/app/(tabs)/_layout.tsx
index a0ef9a8..27af1d7 100644
--- a/app/(tabs)/_layout.tsx
+++ b/app/(tabs)/_layout.tsx
@@ -4,15 +4,16 @@ import React from 'react'
 import { StyleSheet } from 'react-native'
 
 const _layout = () => {
     return (
         <Tabs
-        tabBar={(props) => <CustomTabs {...props} />}
-        screenOptions={{headerShown:false}}
+            tabBar={(props) => <CustomTabs {...props} />}
+            screenOptions={{ headerShown: false }}
         >
             <Tabs.Screen name="index" />
             <Tabs.Screen name="statistics" />
+            <Tabs.Screen name="fynn" />
             <Tabs.Screen name="accounts" />
             <Tabs.Screen name="profile" />
         </Tabs>
     )
 }
diff --git a/app/(tabs)/fynn.tsx b/app/(tabs)/fynn.tsx
new file mode 100644
index 0000000..47ffeea
--- /dev/null
+++ b/app/(tabs)/fynn.tsx
@@ -0,0 +1,260 @@
+import ScreenWrapper from '@/components/ScreenWrapper'
+import Typo from '@/components/Typo'
+import { sendFynnMessage } from '@/lib/services/fynn'
+import { LinearGradient } from 'expo-linear-gradient'
+import { ArrowUp, Heart, List, Plus, X } from 'phosphor-react-native'
+import React, { useEffect, useRef, useState } from 'react'
+import {
+  Animated,
+  KeyboardAvoidingView,
+  Platform,
+  Pressable,
+  ScrollView,
+  TextInput,
+  TouchableOpacity,
+  View,
+} from 'react-native'
+import { useSafeAreaInsets } from 'react-native-safe-area-context'
+
+type ChatMessage = { id: string; role: 'assistant' | 'user'; text: string }
+type Chat = { id: string; title: string; messages: ChatMessage[] }
+
+const starterPrompts = [
+  'Help me build a budget',
+  'Where can I save this month?',
+  'Explain my spending',
+]
+
+export default function Fynn() {
+  const insets = useSafeAreaInsets()
+  const heartScale = useRef(new Animated.Value(1)).current
+  const [chats, setChats] = useState<Chat[]>([])
+  const [activeChatId, setActiveChatId] = useState<string | null>(null)
+  const [draft, setDraft] = useState('')
+  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
+  const [isSending, setIsSending] = useState(false)
+
+  const activeChat = chats.find((chat) => chat.id === activeChatId)
+  const messages = activeChat?.messages ?? []
+
+  useEffect(() => {
+    if (messages.length > 0) return
+
+    const heartbeat = Animated.loop(
+      Animated.sequence([
+        Animated.timing(heartScale, { toValue: 1.2, duration: 1000, useNativeDriver: true }),
+        Animated.timing(heartScale, { toValue: 1, duration: 1000, useNativeDriver: true }),
+        Animated.delay(500),
+      ])
+    )
+    heartbeat.start()
+    return () => heartbeat.stop()
+  }, [heartScale, messages.length])
+
+  const startNewChat = () => {
+    setActiveChatId(null)
+    setDraft('')
+    setIsSidebarOpen(false)
+  }
+
+  const sendMessage = async (text = draft) => {
+    const cleanText = text.trim()
+    if (!cleanText || isSending) return
+
+    const timestamp = Date.now()
+    const userMessage: ChatMessage = { id: `${timestamp}-user`, role: 'user', text: cleanText }
+    const chatId = activeChatId ?? `${timestamp}`
+    const history = messages.map((message) => ({
+      role: message.role,
+      content: message.text,
+    }))
+
+    if (activeChatId) {
+      setChats((current) => current.map((chat) => (
+        chat.id === activeChatId
+          ? { ...chat, messages: [...chat.messages, userMessage] }
+          : chat
+      )))
+    } else {
+      const newChat: Chat = {
+        id: chatId,
+        title: cleanText,
+        messages: [userMessage],
+      }
+      setChats((current) => [newChat, ...current])
+      setActiveChatId(newChat.id)
+    }
+    setDraft('')
+    setIsSending(true)
+
+    try {
+      const response = await sendFynnMessage(cleanText, history)
+      const assistantMessage: ChatMessage = {
+        id: `${timestamp}-assistant`,
+        role: 'assistant',
+        text: response.success && response.data?.type === 'message'
+          ? response.data.text
+          : response.msg || 'Fynn could not respond. Please try again.',
+      }
+      setChats((current) => current.map((chat) => (
+        chat.id === chatId
+          ? { ...chat, messages: [...chat.messages, assistantMessage] }
+          : chat
+      )))
+    } catch {
+      setChats((current) => current.map((chat) => (
+        chat.id === chatId
+          ? {
+              ...chat,
+              messages: [
+                ...chat.messages,
+                {
+                  id: `${timestamp}-assistant`,
+                  role: 'assistant',
+                  text: 'Fynn could not respond. Please try again.',
+                },
+              ],
+            }
+          : chat
+      )))
+    } finally {
+      setIsSending(false)
+    }
+  }
+
+  return (
+    <ScreenWrapper >
+      <KeyboardAvoidingView
+        className="flex-1"
+        behavior={'padding'}
+        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
+      >
+        <View className="h-[58px] flex-row items-center justify-between px-4">
+          <TouchableOpacity
+            accessibilityLabel="Open recent chats"
+            onPress={() => setIsSidebarOpen(true)}
+            className="h-[42px] w-[42px] items-center justify-center rounded-full"
+          >
+            <List size={23} color="#f5f5f5" weight="bold" />
+          </TouchableOpacity>
+          <View className="flex-row items-center gap-2">
+            <Typo size={18} fontWeight="600" className="text-neutral-100">Fynn</Typo>
+          </View>
+          <TouchableOpacity accessibilityLabel="Start new chat" onPress={startNewChat} className="h-[42px] w-[42px] items-center justify-center rounded-full">
+            <Plus size={23} color="#f5f5f5" weight="bold" />
+          </TouchableOpacity>
+        </View>
+
+        <ScrollView
+          contentContainerStyle={{ flexGrow: 1 }}
+          className="flex-1"
+          keyboardShouldPersistTaps="handled"
+          showsVerticalScrollIndicator={false}
+        >
+          <View className={`flex-1 px-5 pb-28 pt-[18px] ${messages.length === 0 ? 'justify-center' : ''}`}>
+            {messages.length === 0 ? (
+              <View className="-mt-7 items-center">
+                <Animated.View className="mb-5 h-[90px] w-[90px] items-center justify-center" style={{ transform: [{ scale: heartScale }] }}>
+                  <Heart size={90} color="#a3e635" weight="fill" />
+                </Animated.View>
+                <Typo size={25} fontWeight="600" className="text-neutral-100">How can I help?</Typo>
+                <Typo size={14} className="mt-[7px] text-center text-neutral-400">
+                  Ask anything about your money.
+                </Typo>
+                <View className="mt-[27px] w-full items-center gap-[9px]">
+                  {starterPrompts.map((prompt) => (
+                    <TouchableOpacity key={prompt} disabled={isSending} onPress={() => sendMessage(prompt)} className="rounded-full border border-neutral-700 px-[15px] py-2.5">
+                      <Typo size={13} className="text-neutral-300">{prompt}</Typo>
+                    </TouchableOpacity>
+                  ))}
+                </View>
+              </View>
+            ) : messages.map((message) => (
+              <View key={message.id} className={`mb-3.5 flex-row items-end gap-2 ${message.role === 'user' ? 'justify-end' : ''}`}>
+                {message.role === 'assistant' ?
+                  <View className="h-7 w-7 items-center justify-center rounded-full bg-lime-400">
+                    <Heart size={14} color="#171717" weight="fill" />
+                  </View> : null
+                }
+                <View className={`max-w-[82%] rounded-[18px] px-3.5 py-[11px] ${message.role === 'user' ? 'rounded-br-[5px] bg-lime-400' : 'rounded-bl-[5px] bg-neutral-800'}`}>
+                  <Typo size={15} className={message.role === 'user' ? 'text-neutral-900' : 'text-neutral-100'}>{message.text}</Typo>
+                </View>
+              </View>
+            ))}
+            {isSending ? (
+              <View className="mb-3.5 flex-row items-end gap-2">
+                <View className="h-7 w-7 items-center justify-center rounded-full bg-lime-400">
+                  <Heart size={14} color="#171717" weight="fill" />
+                </View>
+                <View className="rounded-[18px] rounded-bl-[5px] bg-neutral-800 px-3.5 py-[11px]">
+                  <Typo size={15} className="text-neutral-400">Fynn is thinking...</Typo>
+                </View>
+              </View>
+            ) : null}
+          </View>
+        </ScrollView>
+
+        <LinearGradient
+          pointerEvents="none"
+          colors={['rgba(23, 23, 23, 0)', '#171717']}
+          locations={[0, 0.82]}
+          style={{ position: 'absolute', right: 0, bottom: 0, left: 0, height: 170, zIndex: 5 }}
+        />
+
+        <View className="absolute bottom-0 left-0 right-0 z-10 bg-transparent px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 14) }}>
+          <View className="max-h-[120px] min-h-[54px] flex-row items-end rounded-[20px] bg-neutral-800 pl-[15px] pr-1.5">
+            <TextInput
+              value={draft}
+              onChangeText={setDraft}
+              onSubmitEditing={() => sendMessage()}
+              editable={!isSending}
+              placeholder="Ask Fynn..."
+              placeholderTextColor="#737373"
+              className="max-h-24 flex-1 py-[15px] text-[15px] leading-5 text-neutral-100"
+              multiline
+              maxLength={500}
+              returnKeyType="send"
+            />
+            <TouchableOpacity accessibilityLabel="Send message" disabled={!draft.trim() || isSending} onPress={() => sendMessage()} className={`mb-1.5 h-[42px] w-[42px] items-center justify-center rounded-full ${draft.trim() && !isSending ? 'bg-lime-400' : 'bg-neutral-700'}`}>
+              <ArrowUp size={20} color={draft.trim() && !isSending ? '#171717' : '#737373'} weight="bold" />
+            </TouchableOpacity>
+          </View>
+        </View>
+      </KeyboardAvoidingView>
+
+      {isSidebarOpen ? (
+        <View className="absolute inset-0 z-10 flex-row">
+          <Pressable accessibilityLabel="Close recent chats" onPress={() => setIsSidebarOpen(false)} className="flex-1 bg-black/60" />
+          <View className="w-4/5 max-w-80 bg-neutral-900 px-4 pb-6" style={{ paddingTop: Math.max(insets.top, 18) }}>
+            <View className="h-12 flex-row items-center justify-between">
+              <Typo size={18} fontWeight="600" className="text-neutral-100">Recent chats</Typo>
+              <TouchableOpacity accessibilityLabel="Close recent chats" onPress={() => setIsSidebarOpen(false)} className="h-[38px] w-[38px] items-center justify-center rounded-full">
+                <X size={20} color="#f5f5f5" weight="bold" />
+              </TouchableOpacity>
+            </View>
+            <TouchableOpacity onPress={startNewChat} className="mb-[18px] mt-4 h-[46px] flex-row items-center justify-center gap-[9px] rounded-[14px] bg-lime-400">
+              <Plus size={18} color="#171717" weight="bold" />
+              <Typo size={14} fontWeight="600" className="text-neutral-900">New chat</Typo>
+            </TouchableOpacity>
+            {chats.length === 0 ? (
+              <Typo size={14} className="mt-3 text-center text-neutral-500">Your conversations will appear here.</Typo>
+            ) : (
+              <ScrollView showsVerticalScrollIndicator={false}>
+                {chats.map((chat) => (
+                  <TouchableOpacity
+                    key={chat.id}
+                    onPress={() => { setActiveChatId(chat.id); setIsSidebarOpen(false) }}
+                    className={`min-h-12 flex-row items-center gap-2.5 rounded-xl px-[11px] ${chat.id === activeChatId ? 'bg-neutral-800' : ''}`}
+                  >
+                    <Heart size={16} color={chat.id === activeChatId ? '#a3e635' : '#a3a3a3'} weight="fill" />
+                    <Typo textProps={{ numberOfLines: 1 }} size={14} className="flex-1 text-neutral-200">{chat.title}</Typo>
+                  </TouchableOpacity>
+                ))}
+              </ScrollView>
+            )}
+          </View>
+        </View>
+      ) : null}
+    </ScreenWrapper>
+  )
+}
diff --git a/components/CustomTabs.tsx b/components/CustomTabs.tsx
index dcfcb2d..461d589 100644
--- a/components/CustomTabs.tsx
+++ b/components/CustomTabs.tsx
@@ -28,10 +28,17 @@ export default function CustomTabs({ state, descriptors, navigation }: BottomTab
         size={AVATAR_SIZE}
         weight={isFocused ? 'fill' : 'regular'}
         color={isFocused ? '#a3e635' : '#a3a3a3'}
       />
     ),
+    fynn: (isFocused) => (
+      <Icons.Heart
+        size={AVATAR_SIZE}
+        weight={isFocused ? 'fill' : 'regular'}
+        color={isFocused ? '#a3e635' : '#a3a3a3'}
+      />
+    ),
     accounts: (isFocused) => (
       <Icons.Wallet
         size={AVATAR_SIZE}
         weight={isFocused ? 'fill' : 'regular'}
         color={isFocused ? '#a3e635' : '#a3a3a3'}
diff --git a/lib/services/fynn.ts b/lib/services/fynn.ts
new file mode 100644
index 0000000..3eff35d
--- /dev/null
+++ b/lib/services/fynn.ts
@@ -0,0 +1,19 @@
+import { supabase } from '@/lib/supabase'
+import { ResponseType } from '@/types'
+
+export type FynnChatResponse =
+  | { type: 'message'; text: string }
+  | { type: 'proposal'; proposalId: string; summary: string; preview: unknown; text?: string }
+
+export async function sendFynnMessage(
+  message: string,
+  history: { role: 'user' | 'assistant'; content: string }[] = []
+): Promise<ResponseType & { data?: FynnChatResponse }> {
+  const { data, error } = await supabase.functions.invoke('fynn-chat', {
+    body: { message, history },
+  })
+
+  if (error) return { success: false, msg: error.message }
+  if (data?.error) return { success: false, msg: String(data.error) }
+  return { success: true, data: data as FynnChatResponse }
+}
diff --git a/supabase/functions/fynn-chat/index.test.ts b/supabase/functions/fynn-chat/index.test.ts
new file mode 100644
index 0000000..67ad6f9
--- /dev/null
+++ b/supabase/functions/fynn-chat/index.test.ts
@@ -0,0 +1,74 @@
+import { assertEquals, assertStringIncludes } from 'jsr:@std/assert'
+import { createFynnChatHandler } from './index.ts'
+
+Deno.test('Fynn chat executes read tools and returns the follow-up message', async () => {
+  const providerInputs: Array<{ messages: Array<{ role: string; content: string }> }> = []
+  let completionCount = 0
+  const handler = createFynnChatHandler({
+    getAuthedUserClient: async () => ({ user: { id: 'user-1' }, userClient: {} }),
+    getLlmProvider: () => ({
+      complete: async (input) => {
+        providerInputs.push(input)
+        completionCount += 1
+        return completionCount === 1
+          ? {
+              toolCalls: [
+                { id: 'call-1', name: 'list_accounts', arguments: { limit: 5 } },
+              ],
+            }
+          : { assistantText: 'You have one account.', toolCalls: [] }
+      },
+    }),
+    executeTool: async ({ name, args, userId }) => {
+      assertEquals(name, 'list_accounts')
+      assertEquals(args, { limit: 5 })
+      assertEquals(userId, 'user-1')
+      return { ok: true, result: [{ name: 'Checking', balance: 12500 }] }
+    },
+  })
+
+  const response = await handler(
+    new Request('http://localhost/fynn-chat', {
+      method: 'POST',
+      body: JSON.stringify({ message: 'List my accounts', history: [] }),
+    })
+  )
+
+  assertEquals(response.status, 200)
+  assertEquals(await response.json(), { type: 'message', text: 'You have one account.' })
+  assertEquals(providerInputs.length, 2)
+  assertStringIncludes(providerInputs[0].messages[0].content, 'never invent balances')
+  assertEquals(providerInputs[1].messages.at(-1), {
+    role: 'tool',
+    content: JSON.stringify({ ok: true, result: [{ name: 'Checking', balance: 12500 }] }),
+    toolCallId: 'call-1',
+    name: 'list_accounts',
+  })
+})
+
+Deno.test('Fynn chat stops after six tool iterations', async () => {
+  let calls = 0
+  const handler = createFynnChatHandler({
+    getAuthedUserClient: async () => ({ user: { id: 'user-1' }, userClient: {} }),
+    getLlmProvider: () => ({
+      complete: async () => {
+        calls += 1
+        return {
+          toolCalls: [{ id: `${calls}`, name: 'list_accounts', arguments: {} }],
+        }
+      },
+    }),
+    executeTool: async () => ({ ok: true, result: [] }),
+  })
+
+  const response = await handler(
+    new Request('http://localhost/fynn-chat', {
+      method: 'POST',
+      body: JSON.stringify({ message: 'List my accounts' }),
+    })
+  )
+
+  assertEquals(calls, 6)
+  assertEquals(response.status, 400)
+  assertEquals(await response.json(), { error: 'Unable to complete chat response' })
+})
diff --git a/supabase/functions/fynn-chat/index.ts b/supabase/functions/fynn-chat/index.ts
new file mode 100644
index 0000000..83f5675
--- /dev/null
+++ b/supabase/functions/fynn-chat/index.ts
@@ -0,0 +1,120 @@
+import { getAuthedUserClient } from '../_shared/auth.ts'
+import { corsHeaders, json } from '../_shared/cors.ts'
+import { getLlmProvider } from '../_shared/llm/provider.ts'
+import type { ChatMessage, LlmProvider } from '../_shared/llm/types.ts'
+import { TOOL_DEFS } from '../_shared/tools/catalog.ts'
+import { executeTool } from '../_shared/tools/executor.ts'
+
+const MAX_TOOL_ITERATIONS = 6
+
+type ToolResult = { ok: true; result: unknown } | { ok: false; error: string }
+
+type FynnChatDependencies = {
+  getAuthedUserClient: (req: Request) => Promise<{
+    user: { id: string }
+    userClient: any
+  }>
+  getLlmProvider: () => LlmProvider
+  executeTool: (input: {
+    name: string
+    args: Record<string, unknown>
+    userId: string
+    userClient: any
+  }) => Promise<ToolResult>
+}
+
+const systemPrompt = `You are Fynn, a helpful personal finance assistant. Use the available tools to answer questions about this user's money data. Never invent balances, transactions, subscriptions, or other financial data. Only use the listed tools, and clearly say when the data is unavailable.`
+
+function parseMessages(
+  history: unknown,
+  message: unknown
+): ChatMessage[] | null {
+  if (typeof message !== 'string' || !message.trim()) return null
+
+  const priorMessages = Array.isArray(history)
+    ? history.flatMap((item): ChatMessage[] => {
+        if (
+          !item ||
+          typeof item !== 'object' ||
+          !('role' in item) ||
+          !('content' in item) ||
+          (item.role !== 'user' && item.role !== 'assistant') ||
+          typeof item.content !== 'string'
+        ) {
+          return []
+        }
+
+        return [{ role: item.role, content: item.content }]
+      })
+    : []
+
+  return [
+    { role: 'system', content: systemPrompt },
+    ...priorMessages,
+    { role: 'user', content: message.trim() },
+  ]
+}
+
+export function createFynnChatHandler(
+  dependencies: FynnChatDependencies = {
+    getAuthedUserClient,
+    getLlmProvider,
+    executeTool,
+  }
+) {
+  return async (req: Request): Promise<Response> => {
+    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
+    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
+
+    try {
+      const { user, userClient } = await dependencies.getAuthedUserClient(req)
+      const body = await req.json().catch(() => ({}))
+      const messages = parseMessages(body.history, body.message)
+      if (!messages) return json({ error: 'Message is required' }, 400)
+
+      const provider = dependencies.getLlmProvider()
+      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
+        const completion = await provider.complete({ messages, tools: TOOL_DEFS })
+        if (completion.toolCalls.length === 0) {
+          if (!completion.assistantText?.trim()) {
+            throw new Error('Unable to complete chat response')
+          }
+          return json({ type: 'message', text: completion.assistantText })
+        }
+
+        for (const toolCall of completion.toolCalls) {
+          messages.push({
+            role: 'assistant',
+            content: JSON.stringify(toolCall.arguments),
+            toolCallId: toolCall.id,
+            name: toolCall.name,
+          })
+
+          const result = await dependencies.executeTool({
+            name: toolCall.name,
+            args: toolCall.arguments,
+            userId: user.id,
+            userClient,
+          })
+          messages.push({
+            role: 'tool',
+            content: JSON.stringify(result),
+            toolCallId: toolCall.id,
+            name: toolCall.name,
+          })
+        }
+      }
+
+      throw new Error('Unable to complete chat response')
+    } catch (error) {
+      return json(
+        { error: error instanceof Error ? error.message : 'Fynn chat failed' },
+        400
+      )
+    }
+  }
+}
+
+if (import.meta.main) {
+  Deno.serve(createFynnChatHandler())
+}

```
