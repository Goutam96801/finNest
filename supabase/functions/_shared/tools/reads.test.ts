import { assertEquals } from 'jsr:@std/assert'
import { listTransactions } from './reads.ts'

Deno.test('listTransactions ignores an accountId that is not a UUID', async () => {
  const orFilters: string[] = []
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    limit: () => query,
    or: (filter: string) => {
      orFilters.push(filter)
      return query
    },
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve),
  }
  const userClient = {
    from: (table: string) => {
      assertEquals(table, 'transactions')
      return query
    },
  }

  const result = await listTransactions({
    args: { accountId: 'id.eq.anything', limit: 5 },
    userId: 'user-1',
    userClient: userClient as never,
  })

  assertEquals(result, [])
  assertEquals(orFilters, [])
})
