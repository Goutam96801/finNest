import { assertEquals } from 'jsr:@std/assert'
import { createFynnConfirmHandler } from './index.ts'

Deno.test('Fynn confirm rejects the authenticated user pending proposal without applying it', async () => {
  let applied = false
  const claims: Array<Record<string, unknown>> = []
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
    updateProposal: async () => {},
    claimProposal: async (_client, id, userId, status) => {
      claims.push({ id, userId, status })
      return {
        id: 'proposal-1',
        user_id: 'user-1',
        tool_name: 'propose_create_transaction',
        payload: {},
        status: 'rejected',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      }
    },
    rollbackAcceptedProposal: async () => {},
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
  assertEquals(claims, [{ id: 'proposal-1', userId: 'user-1', status: 'rejected' }])
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
    claimProposal: async () => null,
    rollbackAcceptedProposal: async () => {},
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

Deno.test('Fynn confirm does not apply a proposal when an atomic claim loses the race', async () => {
  let applied = false
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
    claimProposal: async () => null,
    updateProposal: async () => {},
    rollbackAcceptedProposal: async () => {},
    applyProposal: async () => {
      applied = true
      return {}
    },
  })

  const response = await handler(new Request('http://localhost/fynn-confirm', {
    method: 'POST',
    body: JSON.stringify({ proposal_id: 'proposal-1', action: 'accept' }),
  }))

  assertEquals(response.status, 404)
  assertEquals(await response.json(), { error: 'Proposal not found or already resolved' })
  assertEquals(applied, false)
})

Deno.test('Fynn confirm returns 401 when authentication fails', async () => {
  const handler = createFynnConfirmHandler({
    getAuthedUserClient: async () => {
      throw new Error('Missing authorization')
    },
    getProposal: async () => null,
    claimProposal: async () => null,
    updateProposal: async () => {},
    rollbackAcceptedProposal: async () => {},
    applyProposal: async () => ({}),
  })

  const response = await handler(new Request('http://localhost/fynn-confirm', {
    method: 'POST',
    body: JSON.stringify({ proposal_id: 'proposal-1', action: 'accept' }),
  }))

  assertEquals(response.status, 401)
  assertEquals(await response.json(), { error: 'Missing authorization' })
})
