import type { ToolDef } from '../llm/types.ts'

const limitParameter = {
  type: 'integer',
  minimum: 1,
  maximum: 25,
  description: 'Maximum number of records to return.',
}

export const TOOL_DEFS: ToolDef[] = [
  {
    name: 'list_accounts',
    description: 'List the user’s active financial accounts and balances.',
    parameters: {
      type: 'object',
      properties: { limit: limitParameter },
      additionalProperties: false,
    },
  },
  {
    name: 'list_transactions',
    description: 'List the user’s transactions, optionally filtered by type, account, date range, or text.',
    parameters: {
      type: 'object',
      properties: {
        limit: limitParameter,
        type: { type: 'string', enum: ['expense', 'income', 'transfer'] },
        accountId: { type: 'string', description: 'Account UUID to match on either side of a transfer.' },
        from: { type: 'string', format: 'date-time', description: 'Inclusive transaction date.' },
        to: { type: 'string', format: 'date-time', description: 'Inclusive transaction date.' },
        search: { type: 'string', maxLength: 100, description: 'Text in a transaction description or category.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_transaction',
    description: 'Get one transaction by ID.',
    parameters: {
      type: 'object',
      properties: { transactionId: { type: 'string', description: 'Transaction UUID.' } },
      required: ['transactionId'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_subscriptions',
    description: 'List the user’s active recurring subscriptions, ordered by next due date.',
    parameters: {
      type: 'object',
      properties: { limit: limitParameter },
      additionalProperties: false,
    },
  },
  {
    name: 'get_profile',
    description: 'Get the user’s profile preferences.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_notifications',
    description: 'List the user’s most recent notifications.',
    parameters: {
      type: 'object',
      properties: { limit: limitParameter },
      additionalProperties: false,
    },
  },
]
