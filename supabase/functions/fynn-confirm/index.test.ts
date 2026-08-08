import { assertEquals } from 'jsr:@std/assert'
import { createFynnConfirmHandler } from './index.ts'

Deno.test('Fynn confirm rejects the authenticated user pending proposal without applying it', async () => {
  let applied = false
  const updates: Array<Record<string, unknown>> = []
  const handler = createFynnConfirmHandler({
    getAuthedUserClient: async () => ({ user: { id: 'user-1' }, userClient: {} }),
    getProposal: async () => ({
      id: 'proposal-1',
      user_id: 'user-1',
      tool_name: 'propose_create_transaction',
      payload: {},
      status: 'pending',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    }),
    updateProposal: async (_client, id, patch) => {
      updates.push({ id, ...patch })
    },
    applyProposal: async () => {
      applied = true
      return {}
    },
  })

  const response = await handler(new Request('http://localhost/fynn-confirm', {
    method: 'POST',
    body: JSON.stringify({ proposal_id: 'proposal-1', action: 'reject' }),
  }))

  assertEquals(response.status, 200)
  assertEquals(await response.json(), { success: true, status: 'rejected' })
  assertEquals(applied, false)
  assertEquals(updates.length, 1)
  assertEquals(updates[0].status, 'rejected')
})

Deno.test('Fynn confirm expires a stale proposal without applying it', async () => {
  const updates: Array<Record<string, unknown>> = []
  const handler = createFynnConfirmHandler({
    getAuthedUserClient: async () => ({ user: { id: 'user-1' }, userClient: {} }),
    getProposal: async () => ({
      id: 'proposal-1',
      user_id: 'user-1',
      tool_name: 'propose_create_transaction',
      payload: {},
      status: 'pending',
      expires_at: new Date(Date.now() - 1).toISOString(),
    }),
    updateProposal: async (_client, id, patch) => {
      updates.push({ id, ...patch })
    },
    applyProposal: async () => ({}),
  })

  const response = await handler(new Request('http://localhost/fynn-confirm', {
    method: 'POST',
    body: JSON.stringify({ proposal_id: 'proposal-1', action: 'accept' }),
  }))

  assertEquals(response.status, 400)
  assertEquals(await response.json(), { error: 'Proposal has expired' })
  assertEquals(updates[0].status, 'expired')
})
