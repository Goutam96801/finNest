import { assertEquals, assertStringIncludes } from 'jsr:@std/assert'
import { createFynnChatHandler } from './index.ts'

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
  })

  const response = await handler(
    new Request('http://localhost/fynn-chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'List my accounts', history: [] }),
    })
  )

  assertEquals(response.status, 200)
  assertEquals(await response.json(), { type: 'message', text: 'You have one account.' })
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
