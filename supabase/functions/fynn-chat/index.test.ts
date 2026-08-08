import { assertEquals, assertStringIncludes } from 'jsr:@std/assert'
import { createFynnChatHandler } from './index.ts'

function testPersistence() {
  return {
    createChat: async () => 'chat-1',
    requireChat: async () => {},
    listMessages: async () => [],
    saveMessage: async (_userClient: unknown, input: { role: 'user' | 'assistant' }) =>
      input.role === 'user' ? 'user-message-1' : 'assistant-message-1',
  }
}

Deno.test('Fynn chat executes read tools and returns the follow-up message', async () => {
  const providerInputs: Array<{
    messages: Array<{
      role: string
      content: string
      toolCallId?: string
      name?: string
    }>
  }> = []
  let completionCount = 0
  const handler = createFynnChatHandler({
    getAuthedUserClient: async () => ({ user: { id: 'user-1' }, userClient: {} }),
    getLlmProvider: () => ({
      complete: async (input) => {
        providerInputs.push(input)
        completionCount += 1
        return completionCount === 1
          ? {
              toolCalls: [
                { id: 'call-1', name: 'list_accounts', arguments: { limit: 5 } },
              ],
            }
          : { assistantText: 'You have one account.', toolCalls: [] }
      },
    }),
    executeTool: async ({ name, args, userId }) => {
      assertEquals(name, 'list_accounts')
      assertEquals(args, { limit: 5 })
      assertEquals(userId, 'user-1')
      return { ok: true, result: [{ name: 'Checking', balance: 12500 }] }
    },
    persistence: testPersistence(),
  })

  const response = await handler(
    new Request('http://localhost/fynn-chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'List my accounts', history: [] }),
    })
  )

  assertEquals(response.status, 200)
  assertEquals(await response.json(), {
    type: 'message',
    text: 'You have one account.',
    chatId: 'chat-1',
    userMessageId: 'user-message-1',
    messageId: 'assistant-message-1',
  })
  assertEquals(providerInputs.length, 2)
  assertStringIncludes(providerInputs[0].messages[0].content, 'Never invent balances')
  assertEquals(providerInputs[1].messages.at(-1), {
    role: 'tool',
    content: JSON.stringify({ ok: true, result: [{ name: 'Checking', balance: 12500 }] }),
    toolCallId: 'call-1',
    name: 'list_accounts',
  })
})

Deno.test('Fynn chat returns a proposal immediately after a propose tool succeeds', async () => {
  let completions = 0
  const handler = createFynnChatHandler({
    getAuthedUserClient: async () => ({ user: { id: 'user-1' }, userClient: {} }),
    getLlmProvider: () => ({
      complete: async () => {
        completions += 1
        return {
          toolCalls: [{
            id: 'proposal-call',
            name: 'propose_create_transaction',
            arguments: { amount: 50, type: 'expense', accountId: 'account-1', category: 'dining' },
          }],
        }
      },
    }),
    executeTool: async () => ({
      ok: true,
      result: {
        proposal_id: 'proposal-1',
        summary: 'Add a ₹50 Dining expense.',
        preview: { amount: 50, type: 'expense' },
      },
    }),
    persistence: testPersistence(),
  })

  const response = await handler(
    new Request('http://localhost/fynn-chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Add expense ₹50 for tea', history: [] }),
    })
  )

  assertEquals(response.status, 200)
  assertEquals(await response.json(), {
    type: 'proposal',
    proposalId: 'proposal-1',
    summary: 'Add a ₹50 Dining expense.',
    preview: { amount: 50, type: 'expense' },
    text: 'Please confirm this change.',
    chatId: 'chat-1',
    userMessageId: 'user-message-1',
    messageId: 'assistant-message-1',
  })
  assertEquals(completions, 1)
})

Deno.test('Fynn chat stops after six tool iterations', async () => {
  let calls = 0
  const handler = createFynnChatHandler({
    getAuthedUserClient: async () => ({ user: { id: 'user-1' }, userClient: {} }),
    getLlmProvider: () => ({
      complete: async () => {
        calls += 1
        return {
          toolCalls: [{ id: `${calls}`, name: 'list_accounts', arguments: {} }],
        }
      },
    }),
    executeTool: async () => ({ ok: true, result: [] }),
    persistence: testPersistence(),
  })

  const response = await handler(
    new Request('http://localhost/fynn-chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'List my accounts' }),
    })
  )

  assertEquals(calls, 6)
  assertEquals(response.status, 400)
  assertEquals(await response.json(), { error: 'Unable to complete chat response' })
})

Deno.test('Fynn chat creates a chat and persists the completed turn', async () => {
  const calls: Array<{ table: string; action: string; payload?: unknown }> = []
  const userClient = {
    from: (table: string) => ({
      insert: (payload: unknown) => {
        calls.push({ table, action: 'insert', payload })
        return {
          select: () => ({
            single: async () => ({ data: { id: 'chat-1' }, error: null }),
          }),
        }
      },
    }),
  }
  const handler = createFynnChatHandler({
    getAuthedUserClient: async () => ({ user: { id: 'user-1' }, userClient }),
    getLlmProvider: () => ({
      complete: async () => ({ assistantText: 'Your balance is ₹100.', toolCalls: [] }),
    }),
    executeTool: async () => ({ ok: true, result: [] }),
  })

  const response = await handler(
    new Request('http://localhost/fynn-chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'What is my balance?' }),
    })
  )

  assertEquals(response.status, 200)
  assertEquals(await response.json(), {
    type: 'message',
    text: 'Your balance is ₹100.',
    chatId: 'chat-1',
    userMessageId: 'chat-1',
    messageId: 'chat-1',
  })
  assertEquals(calls, [
    {
      table: 'fynn_chats',
      action: 'insert',
      payload: { user_id: 'user-1', title: 'What is my balance?' },
    },
    {
      table: 'fynn_messages',
      action: 'insert',
      payload: { chat_id: 'chat-1', user_id: 'user-1', role: 'user', content: 'What is my balance?' },
    },
    {
      table: 'fynn_messages',
      action: 'insert',
      payload: { chat_id: 'chat-1', user_id: 'user-1', role: 'assistant', content: 'Your balance is ₹100.' },
    },
  ])
})

Deno.test('Fynn chat limits each user to 20 turns per minute', async () => {
  let completions = 0
  const handler = createFynnChatHandler({
    getAuthedUserClient: async () => ({
      user: { id: 'rate-limited-user' },
      userClient: {},
    }),
    getLlmProvider: () => ({
      complete: async () => {
        completions += 1
        return { assistantText: 'Hello.', toolCalls: [] }
      },
    }),
    executeTool: async () => ({ ok: true, result: [] }),
    persistence: testPersistence(),
  })

  for (let turn = 0; turn < 20; turn += 1) {
    const response = await handler(
      new Request('http://localhost/fynn-chat', {
        method: 'POST',
        body: JSON.stringify({ message: `Turn ${turn}` }),
      })
    )
    assertEquals(response.status, 200)
  }

  const response = await handler(
    new Request('http://localhost/fynn-chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'One too many' }),
    })
  )

  assertEquals(completions, 20)
  assertEquals(response.status, 429)
  assertEquals(await response.json(), { error: 'Too many Fynn chat requests. Try again later.' })
})

Deno.test('Fynn chat returns 401 when authentication fails', async () => {
  const handler = createFynnChatHandler({
    getAuthedUserClient: async () => {
      throw new Error('Unauthorized')
    },
    getLlmProvider: () => ({
      complete: async () => ({ assistantText: 'unused', toolCalls: [] }),
    }),
    executeTool: async () => ({ ok: true, result: [] }),
    persistence: testPersistence(),
  })

  const response = await handler(new Request('http://localhost/fynn-chat', {
    method: 'POST',
    body: JSON.stringify({ message: 'Hello' }),
  }))

  assertEquals(response.status, 401)
  assertEquals(await response.json(), { error: 'Unauthorized' })
})
