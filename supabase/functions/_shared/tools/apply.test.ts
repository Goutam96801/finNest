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

Deno.test('applyProposal mirrors a changed full name to auth display metadata', async () => {
  let profileUpdate: Record<string, unknown> | undefined
  let authUpdate: Record<string, unknown> | undefined
  const userClient = {
    from: (table: string) => {
      if (table !== 'profiles') throw new Error(`Unexpected table: ${table}`)
      return {
        update: (row: Record<string, unknown>) => {
          profileUpdate = row
          return {
            eq: () => ({
              select: () => ({
                single: async () => ({ data: row, error: null }),
              }),
            }),
          }
        },
      }
    },
    auth: {
      updateUser: async (input: Record<string, unknown>) => {
        authUpdate = input
        return { error: null }
      },
    },
  }

  await applyProposal(userClient as never, 'user-1', {
    tool_name: 'propose_update_profile',
    payload: { profile: { full_name: 'Ada Lovelace' } },
  })

  assertEquals(profileUpdate, { full_name: 'Ada Lovelace' })
  assertEquals(authUpdate, { data: { display_name: 'Ada Lovelace' } })
})

Deno.test('applyProposal creates a subscription notification and requests reminder resync', async () => {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = []
  const accountQuery = {
    eq: () => accountQuery,
    maybeSingle: async () => ({ data: { id: 'account-1' }, error: null }),
  }
  const userClient = {
    from: (table: string) => {
      if (table === 'accounts') return { select: () => accountQuery }
      if (table === 'subscriptions') {
        return {
          insert: (row: Record<string, unknown>) => {
            inserts.push({ table, row })
            return {
              select: () => ({
                single: async () => ({ data: { id: 'subscription-1', ...row }, error: null }),
              }),
            }
          },
        }
      }
      if (table === 'notifications') {
        return {
          insert: (row: Record<string, unknown>) => {
            inserts.push({ table, row })
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

  const result = await applyProposal(userClient as never, 'user-1', {
    tool_name: 'propose_create_subscription',
    payload: {
      subscription: {
        account_id: 'account-1',
        name: 'Netflix',
        amount: 199,
        category: 'entertainment',
        frequency: 'monthly',
        next_due_date: '2026-09-01',
        notes: null,
      },
    },
  })

  assertEquals(result, {
    data: {
      id: 'subscription-1',
      user_id: 'user-1',
      account_id: 'account-1',
      name: 'Netflix',
      amount: 199,
      category: 'entertainment',
      frequency: 'monthly',
      next_due_date: '2026-09-01',
      notes: null,
      is_active: true,
    },
    reminderResyncRequired: true,
  })
  assertEquals(inserts[1], {
    table: 'notifications',
    row: {
      user_id: 'user-1',
      type: 'subscription_due',
      title: 'Netflix reminder set',
      body: 'Due on 2026-09-01',
      data: { subscriptionId: 'subscription-1' },
    },
  })
})

Deno.test('applyProposal keeps a created subscription when its notification insert fails', async () => {
  const accountQuery = {
    eq: () => accountQuery,
    maybeSingle: async () => ({ data: { id: 'account-1' }, error: null }),
  }
  const userClient = {
    from: (table: string) => {
      if (table === 'accounts') return { select: () => accountQuery }
      if (table === 'subscriptions') {
        return {
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: async () => ({ data: { id: 'subscription-1', ...row }, error: null }),
            }),
          }),
        }
      }
      if (table === 'notifications') {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({ data: null, error: new Error('notification unavailable') }),
            }),
          }),
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  }

  const result = await applyProposal(userClient as never, 'user-1', {
    tool_name: 'propose_create_subscription',
    payload: {
      subscription: {
        account_id: 'account-1',
        name: 'Netflix',
        amount: 199,
        category: 'entertainment',
        frequency: 'monthly',
        next_due_date: '2026-09-01',
        notes: null,
      },
    },
  })

  assertEquals(result, {
    data: {
      id: 'subscription-1',
      user_id: 'user-1',
      account_id: 'account-1',
      name: 'Netflix',
      amount: 199,
      category: 'entertainment',
      frequency: 'monthly',
      next_due_date: '2026-09-01',
      notes: null,
      is_active: true,
    },
    reminderResyncRequired: true,
  })
})
