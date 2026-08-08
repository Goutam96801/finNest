import { assertEquals } from 'jsr:@std/assert'
import { applyProposal } from './apply.ts'
import { proposeCreateAccount } from './proposals.ts'

Deno.test('applyProposal creates a transaction from snake_case proposal payload', async () => {
  const inserts: Array<Record<string, unknown>> = []
  const accountQuery = {
    eq: () => accountQuery,
    maybeSingle: async () => ({ data: { id: 'account-1' }, error: null }),
  }
  const userClient = {
    from: (table: string) => {
      if (table === 'accounts') {
        return { select: () => accountQuery }
      }
      if (table === 'transactions') {
        return {
          insert: (row: Record<string, unknown>) => {
            inserts.push(row)
            return {
              select: () => ({
                single: async () => ({ data: row, error: null }),
              }),
            }
          },
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  }

  await applyProposal(userClient as never, 'user-1', {
    tool_name: 'propose_create_transaction',
    payload: {
      transaction: {
        account_id: 'account-1',
        to_account_id: null,
        type: 'expense',
        category: 'Food',
        amount: 50,
        description: 'Tea',
        status: 'completed',
        transaction_date: '2026-08-08T00:00:00.000Z',
      },
    },
  })

  assertEquals(inserts, [{
    user_id: 'user-1',
    account_id: 'account-1',
    to_account_id: null,
    type: 'expense',
    category: 'Food',
    amount: 50,
    description: 'Tea',
    status: 'completed',
    transaction_date: '2026-08-08T00:00:00.000Z',
  }])
})

Deno.test('applyProposal creates an account from a snake_case proposal payload', async () => {
  const inserts: Array<Record<string, unknown>> = []
  const activeAccountQuery = { eq: () => activeAccountQuery }
  const userClient = {
    from: (table: string) => {
      if (table !== 'accounts') throw new Error(`Unexpected table: ${table}`)
      return {
        select: () => activeAccountQuery,
        insert: (row: Record<string, unknown>) => {
          inserts.push(row)
          return {
            select: () => ({
              single: async () => ({ data: row, error: null }),
            }),
          }
        },
      }
    },
  }

  await applyProposal(userClient as never, 'user-1', {
    tool_name: 'propose_create_account',
    payload: {
      account: {
        name: 'Travel fund',
        type: 'bank',
        balance: 1200,
        color: '#3B82F6',
        icon: 'Wallet',
        account_number_last4: '1234',
        bank_name: 'Example Bank',
        credit_limit: null,
        is_primary: false,
        notes: 'For trips',
      },
    },
  })

  assertEquals(inserts, [{
    user_id: 'user-1',
    name: 'Travel fund',
    type: 'bank',
    balance: 1200,
    color: '#3B82F6',
    icon: 'Wallet',
    account_number_last4: '1234',
    bank_name: 'Example Bank',
    credit_limit: null,
    is_primary: true,
    is_archived: false,
    display_order: 0,
    notes: 'For trips',
  }])
})

Deno.test('account proposal stores snake_case payload that apply uses unchanged', async () => {
  let storedProposal: Record<string, unknown> | undefined
  const proposalClient = {
    from: (table: string) => {
      if (table !== 'fynn_proposals') throw new Error(`Unexpected table: ${table}`)
      return {
        insert: (row: Record<string, unknown>) => {
          storedProposal = row
          return {
            select: () => ({
              single: async () => ({ data: { id: 'proposal-1' }, error: null }),
            }),
          }
        },
      }
    },
  }
  const proposal = await proposeCreateAccount({
    args: { name: 'Emergency', type: 'cash', balance: 150 },
    userId: 'user-1',
    userClient: proposalClient as never,
  })

  const inserts: Array<Record<string, unknown>> = []
  const activeAccountQuery = { eq: () => activeAccountQuery }
  const applyClient = {
    from: (table: string) => {
      if (table !== 'accounts') throw new Error(`Unexpected table: ${table}`)
      return {
        select: () => activeAccountQuery,
        insert: (row: Record<string, unknown>) => {
          inserts.push(row)
          return {
            select: () => ({
              single: async () => ({ data: row, error: null }),
            }),
          }
        },
      }
    },
  }
  await applyProposal(applyClient as never, 'user-1', {
    tool_name: 'propose_create_account',
    payload: storedProposal?.payload as Record<string, unknown>,
  })

  assertEquals(storedProposal?.user_id, 'user-1')
  assertEquals(storedProposal?.tool_name, 'propose_create_account')
  assertEquals(proposal.proposal_id, 'proposal-1')
  assertEquals(inserts[0], {
    user_id: 'user-1',
    name: 'Emergency',
    type: 'cash',
    balance: 150,
    color: '#3B82F6',
    icon: 'Wallet',
    account_number_last4: null,
    bank_name: null,
    credit_limit: null,
    is_primary: true,
    is_archived: false,
    display_order: 0,
    notes: null,
  })
})
