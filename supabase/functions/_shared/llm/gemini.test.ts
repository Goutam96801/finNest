import { assertEquals, assertRejects } from 'jsr:@std/assert'
import { createGeminiProvider } from './gemini.ts'

Deno.test('Gemini provider maps messages, tools, and function calls', async () => {
  const originalFetch = globalThis.fetch
  let request: Request | undefined

  globalThis.fetch = async (input) => {
    request = input instanceof Request ? input : new Request(input)
    return Response.json({
      candidates: [
        {
          content: {
            parts: [
              { text: 'I can help.' },
              { functionCall: { name: 'lookup_balance', args: { accountId: 'acc-1' } } },
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
        { role: 'assistant', content: '', name: 'lookup_balance' },
        { role: 'tool', content: '{"balance": 42}', toolCallId: 'call_lookup_balance_0', name: 'lookup_balance' },
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
      toolCalls: [{ id: 'call_lookup_balance_0', name: 'lookup_balance', arguments: { accountId: 'acc-1' } }],
    })
    assertEquals(request?.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=secret-key')
    assertEquals(await request?.json(), {
      systemInstruction: { parts: [{ text: 'Be concise.' }] },
      contents: [
        { role: 'user', parts: [{ text: 'What is my balance?' }] },
        { role: 'model', parts: [{ text: 'I will look that up.' }] },
        { role: 'model', parts: [{ functionCall: { name: 'lookup_balance', args: {} } }] },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'lookup_balance',
                response: { content: { balance: 42 } },
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
