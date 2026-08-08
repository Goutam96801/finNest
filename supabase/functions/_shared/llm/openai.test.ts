import { assertEquals, assertRejects } from 'jsr:@std/assert'
import { createOpenAiProvider } from './openai.ts'

Deno.test('OpenAI provider maps messages, tools, and tool calls', async () => {
  const originalFetch = globalThis.fetch
  let request: Request | undefined

  globalThis.fetch = async (input, init) => {
    request = input instanceof Request ? input : new Request(input, init)
    return Response.json({
      choices: [{
        message: {
          content: 'I can help.',
          tool_calls: [{
            id: 'openai-call-123',
            type: 'function',
            function: {
              name: 'lookup_balance',
              arguments: '{"accountId":"acc-1"}',
            },
          }],
        },
      }],
    })
  }

  try {
    const provider = createOpenAiProvider('secret-key', 'gpt-4o-mini')
    const result = await provider.complete({
      messages: [
        { role: 'system', content: 'Be concise.' },
        { role: 'user', content: 'What is my balance?' },
        { role: 'assistant', content: 'I will look that up.' },
        {
          role: 'assistant',
          content: '{"accountId":"acc-1"}',
          toolCallId: 'openai-call-123',
          name: 'lookup_balance',
        },
        {
          role: 'tool',
          content: '{"balance":42}',
          toolCallId: 'openai-call-123',
          name: 'lookup_balance',
        },
      ],
      tools: [{
        name: 'lookup_balance',
        description: 'Looks up an account balance.',
        parameters: {
          type: 'object',
          properties: { accountId: { type: 'string' } },
          required: ['accountId'],
        },
      }],
    })

    assertEquals(result, {
      assistantText: 'I can help.',
      toolCalls: [{ id: 'openai-call-123', name: 'lookup_balance', arguments: { accountId: 'acc-1' } }],
    })
    assertEquals(request?.url, 'https://api.openai.com/v1/chat/completions')
    assertEquals(request?.headers.get('authorization'), 'Bearer secret-key')
    assertEquals(await request?.json(), {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Be concise.' },
        { role: 'user', content: 'What is my balance?' },
        { role: 'assistant', content: 'I will look that up.' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'openai-call-123',
            type: 'function',
            function: { name: 'lookup_balance', arguments: '{"accountId":"acc-1"}' },
          }],
        },
        {
          role: 'tool',
          tool_call_id: 'openai-call-123',
          content: '{"balance":42}',
        },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'lookup_balance',
          description: 'Looks up an account balance.',
          parameters: {
            type: 'object',
            properties: { accountId: { type: 'string' } },
            required: ['accountId'],
          },
        },
      }],
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('OpenAI provider uses an empty object for malformed tool arguments', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({
    choices: [{
      message: {
        tool_calls: [{
          id: 'openai-call-123',
          type: 'function',
          function: { name: 'lookup_balance', arguments: '{not json}' },
        }],
      },
    }],
  })

  try {
    const provider = createOpenAiProvider('secret-key', 'gpt-4o-mini')
    assertEquals(
      await provider.complete({ messages: [{ role: 'user', content: 'Hello' }], tools: [] }),
      { toolCalls: [{ id: 'openai-call-123', name: 'lookup_balance', arguments: {} }] }
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('OpenAI provider redacts rejected-fetch errors', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    throw new Error('Network failed for https://api.openai.com/v1/chat/completions?api_key=secret-key')
  }

  try {
    const provider = createOpenAiProvider('secret-key', 'gpt-4o-mini')
    const error = await assertRejects(
      () => provider.complete({ messages: [{ role: 'user', content: 'Hello' }], tools: [] }),
      Error
    )
    assertEquals(error.message.includes('secret-key'), false)
    assertEquals(error.message, 'OpenAI request failed due to a transport error')
  } finally {
    globalThis.fetch = originalFetch
  }
})
