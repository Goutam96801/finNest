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
  {
    name: 'propose_create_account',
    description: 'Propose creating a financial account. This does not make a change until the user confirms it.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', maxLength: 100 },
        type: { type: 'string', enum: ['bank', 'cash', 'wallet', 'credit_card', 'investment', 'loan', 'other'] },
        balance: { type: 'number' },
        color: { type: 'string', maxLength: 32 },
        icon: { type: 'string', maxLength: 100 },
        accountNumberLast4: { type: 'string', pattern: '^[0-9]{4}$' },
        bankName: { type: 'string', maxLength: 100 },
        creditLimit: { type: 'number', minimum: 0 },
        isPrimary: { type: 'boolean' },
        notes: { type: 'string', maxLength: 500 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'propose_update_account',
    description: 'Propose updating an account. Account balances are managed by transactions.',
    parameters: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'Account UUID.' },
        name: { type: 'string', maxLength: 100 },
        type: { type: 'string', enum: ['bank', 'cash', 'wallet', 'credit_card', 'investment', 'loan', 'other'] },
        color: { type: 'string', maxLength: 32 },
        icon: { type: 'string', maxLength: 100 },
        accountNumberLast4: { type: 'string', pattern: '^[0-9]{4}$' },
        bankName: { type: 'string', maxLength: 100 },
        creditLimit: { type: 'number', minimum: 0 },
        isPrimary: { type: 'boolean' },
        notes: { type: 'string', maxLength: 500 },
      },
      required: ['accountId'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_delete_account',
    description: 'Propose archiving an account. This does not make a change until the user confirms it.',
    parameters: {
      type: 'object',
      properties: { accountId: { type: 'string', description: 'Account UUID.' } },
      required: ['accountId'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_create_subscription',
    description: 'Propose creating a recurring subscription. This does not make a change until the user confirms it.',
    parameters: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'Account UUID.' },
        name: { type: 'string', maxLength: 100 },
        amount: { type: 'number', exclusiveMinimum: 0 },
        category: { type: 'string', maxLength: 100 },
        frequency: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] },
        nextDueDate: { type: 'string', format: 'date' },
        notes: { type: 'string', maxLength: 500 },
      },
      required: ['accountId', 'name', 'amount', 'frequency', 'nextDueDate'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_update_subscription',
    description: 'Propose updating a recurring subscription. This does not make a change until the user confirms it.',
    parameters: {
      type: 'object',
      properties: {
        subscriptionId: { type: 'string', description: 'Subscription UUID.' },
        accountId: { type: 'string', description: 'Account UUID.' },
        name: { type: 'string', maxLength: 100 },
        amount: { type: 'number', exclusiveMinimum: 0 },
        category: { type: 'string', maxLength: 100 },
        frequency: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] },
        nextDueDate: { type: 'string', format: 'date' },
        notes: { type: 'string', maxLength: 500 },
      },
      required: ['subscriptionId'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_delete_subscription',
    description: 'Propose deleting a recurring subscription. This does not make a change until the user confirms it.',
    parameters: {
      type: 'object',
      properties: { subscriptionId: { type: 'string', description: 'Subscription UUID.' } },
      required: ['subscriptionId'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_update_profile',
    description: 'Propose updating safe profile preferences. This does not make a change until the user confirms it.',
    parameters: {
      type: 'object',
      properties: {
        fullName: { type: 'string', maxLength: 100 },
        currency: { type: 'string', maxLength: 10 },
        timezone: { type: 'string', maxLength: 100 },
        subscriptionRemindersEnabled: { type: 'boolean' },
        lowBalanceAlertsEnabled: { type: 'boolean' },
        lowBalanceThreshold: { type: 'number', minimum: 0 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'propose_mark_notification_read',
    description: 'Propose marking one notification, or every notification, as read.',
    parameters: {
      type: 'object',
      properties: {
        notificationId: { type: 'string', description: 'Notification UUID. Omit to mark all as read.' },
        all: { type: 'boolean', description: 'Set true to mark every unread notification as read.' },
      },
      additionalProperties: false,
    },
  },
]
