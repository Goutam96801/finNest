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
  {
    name: 'propose_create_transaction',
    description: 'Propose creating a transaction. This does not make a change until the user confirms it.',
    parameters: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'Source account UUID.' },
        toAccountId: { type: 'string', description: 'Destination account UUID for transfers.' },
        type: { type: 'string', enum: ['expense', 'income', 'transfer'] },
        category: { type: 'string', maxLength: 100 },
        amount: { type: 'number', exclusiveMinimum: 0 },
        description: { type: 'string', maxLength: 500 },
        status: { type: 'string', enum: ['completed', 'pending', 'cancelled'] },
        transactionDate: { type: 'string', format: 'date-time' },
      },
      required: ['accountId', 'type', 'amount'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_update_transaction',
    description: 'Propose updating a transaction. This does not make a change until the user confirms it.',
    parameters: {
      type: 'object',
      properties: {
        transactionId: { type: 'string', description: 'Transaction UUID.' },
        accountId: { type: 'string', description: 'Source account UUID.' },
        toAccountId: { type: 'string', description: 'Destination account UUID for transfers.' },
        type: { type: 'string', enum: ['expense', 'income', 'transfer'] },
        category: { type: 'string', maxLength: 100 },
        amount: { type: 'number', exclusiveMinimum: 0 },
        description: { type: 'string', maxLength: 500 },
        status: { type: 'string', enum: ['completed', 'pending', 'cancelled'] },
        transactionDate: { type: 'string', format: 'date-time' },
      },
      required: ['transactionId'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_delete_transaction',
    description: 'Propose deleting a transaction. This does not make a change until the user confirms it.',
    parameters: {
      type: 'object',
      properties: {
        transactionId: { type: 'string', description: 'Transaction UUID.' },
      },
      required: ['transactionId'],
      additionalProperties: false,
    },
  },
]
