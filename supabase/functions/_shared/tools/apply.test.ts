import { assertEquals } from 'jsr:@std/assert'
import { applyProposal } from './apply.ts'

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
