import { assertEquals, assertRejects } from 'jsr:@std/assert'
import { createGeminiProvider } from './gemini.ts'

Deno.test('Gemini provider maps messages, tools, and function calls', async () => {
  const originalFetch = globalThis.fetch
  let request: Request | undefined

  globalThis.fetch = async (input, init) => {
    request = input instanceof Request ? input : new Request(input, init)
    return Response.json({
      candidates: [
        {
          content: {
            parts: [
              { text: 'I can help.' },
              {
                functionCall: {
                  id: 'gemini-call-123',
                  name: 'lookup_balance',
                  args: { accountId: 'acc-1' },
                },
                thoughtSignature: 'sig-abc',
              },
            ],
          },
        },
      ],
    })
  }

  try {
    const provider = createGeminiProvider('secret-key', 'gemini-2.0-flash')
    const result = await provider.complete({
      messages: [
        { role: 'system', content: 'Be concise.' },
        { role: 'user', content: 'What is my balance?' },
        { role: 'assistant', content: 'I will look that up.' },
        {
          role: 'assistant',
          content: '{"accountId":"acc-1"}',
          toolCallId: 'gemini-call-123',
          name: 'lookup_balance',
          thoughtSignature: 'sig-abc',
        },
        {
          role: 'tool',
          content: '{"balance": 42}',
          toolCallId: 'gemini-call-123',
          name: 'lookup_balance',
        },
      ],
      tools: [
        {
          name: 'lookup_balance',
          description: 'Looks up an account balance.',
          parameters: {
            type: 'object',
            properties: { accountId: { type: 'string' } },
            required: ['accountId'],
          },
        },
      ],
    })

    assertEquals(result, {
      assistantText: 'I can help.',
      toolCalls: [{
        id: 'gemini-call-123',
        name: 'lookup_balance',
        arguments: { accountId: 'acc-1' },
        thoughtSignature: 'sig-abc',
      }],
    })
    assertEquals(
      request?.url,
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'
    )
    assertEquals(request?.headers.get('x-goog-api-key'), 'secret-key')
    assertEquals(await request?.json(), {
      systemInstruction: { parts: [{ text: 'Be concise.' }] },
      contents: [
        { role: 'user', parts: [{ text: 'What is my balance?' }] },
        { role: 'model', parts: [{ text: 'I will look that up.' }] },
        {
          role: 'model',
          parts: [
            {
              functionCall: {
                id: 'gemini-call-123',
                name: 'lookup_balance',
                args: { accountId: 'acc-1' },
              },
              thoughtSignature: 'sig-abc',
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                id: 'gemini-call-123',
                name: 'lookup_balance',
                response: { balance: 42 },
              },
            },
          ],
        },
      ],
      tools: [
        {
          functionDeclarations: [
            {
              name: 'lookup_balance',
              description: 'Looks up an account balance.',
              parameters: {
                type: 'object',
                properties: { accountId: { type: 'string' } },
                required: ['accountId'],
              },
            },
          ],
        },
      ],
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('Gemini provider coalesces parallel tool calls and echoes thoughtSignature on the first', async () => {
  const originalFetch = globalThis.fetch
  let requestBody: unknown

  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body ?? '{}'))
    return Response.json({
      candidates: [{ content: { parts: [{ text: 'Done.' }] } }],
    })
  }

  try {
    const provider = createGeminiProvider('secret-key', 'gemini-flash-latest')
    await provider.complete({
      messages: [
        { role: 'user', content: 'Summarize my money.' },
        {
          role: 'assistant',
          content: '{}',
          toolCallId: 'call_1',
          name: 'list_accounts',
          thoughtSignature: 'parallel-sig',
        },
        {
          role: 'assistant',
          content: '{}',
          toolCallId: 'call_2',
          name: 'list_transactions',
        },
        {
          role: 'tool',
          content: '{"ok":true,"result":[]}',
          toolCallId: 'call_1',
          name: 'list_accounts',
        },
        {
          role: 'tool',
          content: '{"ok":true,"result":[]}',
          toolCallId: 'call_2',
          name: 'list_transactions',
        },
      ],
      tools: [],
    })

    assertEquals(requestBody, {
      contents: [
        { role: 'user', parts: [{ text: 'Summarize my money.' }] },
        {
          role: 'model',
          parts: [
            {
              functionCall: { id: 'call_1', name: 'list_accounts', args: {} },
              thoughtSignature: 'parallel-sig',
            },
            {
              functionCall: { id: 'call_2', name: 'list_transactions', args: {} },
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                id: 'call_1',
                name: 'list_accounts',
                response: { ok: true, result: [] },
              },
            },
            {
              functionResponse: {
                id: 'call_2',
                name: 'list_transactions',
                response: { ok: true, result: [] },
              },
            },
          ],
        },
      ],
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('Gemini provider throws status without exposing its API key', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('invalid key', { status: 401 })

  try {
    const provider = createGeminiProvider('secret-key', 'gemini-2.0-flash')
    await assertRejects(
      () => provider.complete({ messages: [{ role: 'user', content: 'Hello' }], tools: [] }),
      Error,
      'Gemini request failed with status 401'
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('Gemini provider redacts rejected-fetch errors', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    throw new Error(
      'Network failed for https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=secret-key'
    )
  }

  try {
    const provider = createGeminiProvider('secret-key', 'gemini-2.0-flash')
    const error = await assertRejects(
      () => provider.complete({ messages: [{ role: 'user', content: 'Hello' }], tools: [] }),
      Error
    )
    assertEquals(error.message.includes('secret-key'), false)
    assertEquals(error.message, 'Gemini request failed due to a transport error')
  } finally {
    globalThis.fetch = originalFetch
  }
})
