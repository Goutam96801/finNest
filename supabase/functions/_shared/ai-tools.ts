// Shared between fynn-chat and fynn-confirm.
// Keep this file dependency-free (just the supabase-js client type).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { assertPositiveAmount } from './validate.ts'

// ---------------------------------------------------------------------------
// Tool schemas (OpenAI/OpenRouter "tools" format)
// ---------------------------------------------------------------------------

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'get_transactions',
      description:
        "Fetch the user's own transactions, optionally filtered. Use this to answer questions about specific purchases, income, or recent activity.",
      parameters: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: 'ISO date, inclusive. Omit for no lower bound.' },
          end_date: { type: 'string', description: 'ISO date, inclusive. Omit for no upper bound.' },
          type: { type: 'string', enum: ['income', 'expense', 'transfer'] },
          category: { type: 'string', description: 'Category slug, e.g. groceries, dining.' },
          search: { type: 'string', description: 'Free-text match against the description field.' },
          limit: { type: 'integer', description: 'Max rows to return. Default 50, max 200.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_summary',
      description:
        'Get aggregated totals (spend/income) grouped by category or by time period. Use this for "how much did I spend on X" or "compare this month vs last month" style questions instead of pulling raw transactions and adding them up yourself.',
      parameters: {
        type: 'object',
        properties: {
          start_date: { type: 'string' },
          end_date: { type: 'string' },
          type: { type: 'string', enum: ['income', 'expense'] },
          group_by: { type: 'string', enum: ['category', 'day', 'week', 'month'] },
        },
        required: ['group_by'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_accounts',
      description: "List the user's accounts with current balances.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_subscriptions',
      description: "List the user's recurring subscriptions.",
      parameters: {
        type: 'object',
        properties: {
          active_only: { type: 'boolean', description: 'Default true.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_categories',
      description: 'List available spending/income categories (system + user-created).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'render_chart',
      description:
        'Render a chart for the user. Call this whenever the user asks for a chart, graph, breakdown, or trend, or when a visual would make your answer clearer. Do not describe chart data in prose AND render it — pick one, prefer the chart.',
      parameters: {
        type: 'object',
        properties: {
          chart_type: { type: 'string', enum: ['line', 'bar', 'pie'] },
          title: { type: 'string' },
          labels: { type: 'array', items: { type: 'string' } },
          series: {
            type: 'array',
            description: 'One entry per data series (usually just one for pie charts).',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                values: { type: 'array', items: { type: 'number' } },
              },
              required: ['values'],
            },
          },
        },
        required: ['chart_type', 'title', 'labels', 'series'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_transaction_write',
      description:
        "Propose creating, updating, or deleting a transaction on the user's behalf. This NEVER executes immediately — it only shows the user a confirmation card, and nothing happens unless they tap Confirm. Always call this instead of claiming you've made a change. Only call it once you have all required fields: 'create' needs account_id, type, amount, category, transaction_date; 'update' and 'delete' need transaction_id (look it up with get_transactions first if you don't already have it). Ask the user for anything missing instead of guessing.",
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['create', 'update', 'delete'] },
          transaction_id: { type: 'string', description: 'Required for update/delete.' },
          account_id: { type: 'string', description: 'Required for create.' },
          type: { type: 'string', enum: ['income', 'expense', 'transfer'] },
          amount: { type: 'number' },
          category: { type: 'string' },
          description: { type: 'string' },
          transaction_date: { type: 'string', description: 'ISO date.' },
          summary: {
            type: 'string',
            description: 'One short human-readable sentence describing exactly what will happen, shown on the confirmation card.',
          },
        },
        required: ['action', 'summary'],
      },
    },
  },
] as const

export function buildSystemPrompt(opts: { currency: string; timezone: string; today: string }) {
  return `You are the in-app financial assistant for finNest, a personal finance app. The user's currency is ${opts.currency} and timezone is ${opts.timezone}. Today's date is ${opts.today}.

Rules:
- Always use tools to look up real data before answering questions about the user's money. Never estimate or invent numbers.
- Use get_summary for totals/aggregates rather than summing raw transactions yourself.
- When the user asks to see a chart/graph/breakdown/trend, call render_chart with real numbers from a prior tool call — don't also restate the full data as a table in text.
- Format answers in clean markdown: use headings sparingly, bullet points and tables where useful, and bold the key number.
- You can NEVER directly create, edit, or delete data. To make any change, call propose_transaction_write — the user must explicitly confirm it in the UI before anything happens. Never say "I've deleted/added that" — say what you're proposing and that it needs their confirmation.
- If a request is ambiguous (e.g. "delete my last transaction" when there are several candidates), ask a clarifying question instead of guessing.`
}

// ---------------------------------------------------------------------------
// Read-only tool execution — always against a Supabase client scoped to the
// caller's own JWT, so RLS guarantees this can never touch another user's rows.
// ---------------------------------------------------------------------------

export async function executeReadTool(
  supabase: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'get_transactions': {
      let query = supabase
        .from('transactions')
        .select('id, type, category, amount, description, status, transaction_date, account_id')
        .order('transaction_date', { ascending: false })
        .limit(Math.min(Number(args.limit) || 50, 200))

      if (args.start_date) query = query.gte('transaction_date', String(args.start_date))
      if (args.end_date) query = query.lte('transaction_date', String(args.end_date))
      if (args.type) query = query.eq('type', String(args.type))
      if (args.category) query = query.eq('category', String(args.category))
      if (args.search) query = query.ilike('description', `%${String(args.search)}%`)

      const { data, error } = await query
      if (error) throw error
      return { transactions: data }
    }

    case 'get_summary': {
      let query = supabase
        .from('transactions')
        .select('amount, category, type, transaction_date')
        .eq('status', 'completed')

      if (args.start_date) query = query.gte('transaction_date', String(args.start_date))
      if (args.end_date) query = query.lte('transaction_date', String(args.end_date))
      if (args.type) query = query.eq('type', String(args.type))

      const { data, error } = await query
      if (error) throw error

      const groupBy = String(args.group_by || 'category')
      const buckets = new Map<string, number>()

      for (const row of data ?? []) {
        let key: string
        const date = new Date(row.transaction_date as string)
        if (groupBy === 'category') key = (row.category as string) || 'uncategorized'
        else if (groupBy === 'day') key = date.toISOString().slice(0, 10)
        else if (groupBy === 'week') key = `week-of-${new Date(date.setDate(date.getDate() - date.getDay())).toISOString().slice(0, 10)}`
        else key = date.toISOString().slice(0, 7) // month

        buckets.set(key, (buckets.get(key) ?? 0) + Number(row.amount))
      }

      const breakdown = Array.from(buckets.entries())
        .map(([key, total]) => ({ key, total: Math.round(total * 100) / 100 }))
        .sort((a, b) => b.total - a.total)

      const grandTotal = breakdown.reduce((sum, b) => sum + b.total, 0)
      return { group_by: groupBy, breakdown, grand_total: Math.round(grandTotal * 100) / 100, row_count: data?.length ?? 0 }
    }

    case 'get_accounts': {
      const { data, error } = await supabase
        .from('accounts')
        .select('id, name, type, balance, is_primary, is_archived')
        .eq('is_archived', false)
        .order('display_order', { ascending: true })
      if (error) throw error
      return { accounts: data }
    }

    case 'get_subscriptions': {
      let query = supabase
        .from('subscriptions')
        .select('id, name, amount, category, frequency, next_due_date, is_active')
        .order('next_due_date', { ascending: true })
      if (args.active_only !== false) query = query.eq('is_active', true)
      const { data, error } = await query
      if (error) throw error
      return { subscriptions: data }
    }

    case 'get_categories': {
      const { data, error } = await supabase.from('categories').select('name, slug, type, is_system')
      if (error) throw error
      return { categories: data }
    }

    default:
      throw new Error(`Unknown read tool: ${name}`)
  }
}

// ---------------------------------------------------------------------------
// Executing a confirmed write. Called only from fynn-confirm, only after the
// user has tapped Confirm on a fynn_proposals row, and only against a
// Supabase client scoped to that same user's JWT (RLS still applies).
// ---------------------------------------------------------------------------

export interface TransactionWritePayload {
  action: 'create' | 'update' | 'delete'
  transaction_id?: string
  account_id?: string
  type?: 'income' | 'expense' | 'transfer'
  amount?: number
  category?: string
  description?: string
  transaction_date?: string
}

export async function executeTransactionWrite(
  supabase: SupabaseClient,
  userId: string,
  payload: TransactionWritePayload,
): Promise<{ entityId: string | null; before: Record<string, unknown> | null; after: Record<string, unknown> | null }> {
  if (payload.action === 'create') {
    if (!payload.account_id || !payload.type || !payload.amount || !payload.category) {
      throw new Error('Missing required fields for a new transaction')
    }
    const insertRow = {
      user_id: userId,
      account_id: payload.account_id,
      type: payload.type,
      category: payload.category,
      amount: assertPositiveAmount(payload.amount),
      description: payload.description ?? null,
      transaction_date: payload.transaction_date ?? new Date().toISOString(),
    }
    const { data, error } = await supabase.from('transactions').insert(insertRow).select().single()
    if (error) throw error
    return { entityId: data.id, before: null, after: data }
  }

  if (payload.action === 'update') {
    if (!payload.transaction_id) throw new Error('transaction_id is required to update a transaction')
    const { data: before } = await supabase.from('transactions').select('*').eq('id', payload.transaction_id).single()
    const updates: Record<string, unknown> = {}
    if (payload.type !== undefined) updates.type = payload.type
    if (payload.category !== undefined) updates.category = payload.category
    if (payload.amount !== undefined) updates.amount = assertPositiveAmount(payload.amount)
    if (payload.description !== undefined) updates.description = payload.description
    if (payload.transaction_date !== undefined) updates.transaction_date = payload.transaction_date

    const { data, error } = await supabase
      .from('transactions')
      .update(updates)
      .eq('id', payload.transaction_id)
      .select()
      .single()
    if (error) throw error
    return { entityId: payload.transaction_id, before: before ?? null, after: data }
  }

  if (payload.action === 'delete') {
    if (!payload.transaction_id) throw new Error('transaction_id is required to delete a transaction')
    const { data: before } = await supabase.from('transactions').select('*').eq('id', payload.transaction_id).single()
    const { error } = await supabase.from('transactions').delete().eq('id', payload.transaction_id)
    if (error) throw error
    return { entityId: payload.transaction_id, before: before ?? null, after: null }
  }

  throw new Error(`Unknown write action: ${payload.action}`)
}
