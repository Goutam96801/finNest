import { assertEquals, assertThrows } from 'jsr:@std/assert'
import { getLlmProvider } from './provider.ts'

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    Deno.env.delete(name)
  } else {
    Deno.env.set(name, value)
  }
}

Deno.test('provider validates an unsupported provider before its API key', () => {
  const previousProvider = Deno.env.get('LLM_PROVIDER')
  const previousApiKey = Deno.env.get('LLM_API_KEY')
  Deno.env.set('LLM_PROVIDER', 'unsupported')
  Deno.env.delete('LLM_API_KEY')

  try {
    assertThrows(
      () => getLlmProvider(),
      Error,
      'Unsupported LLM_PROVIDER: unsupported'
    )
  } finally {
    restoreEnv('LLM_PROVIDER', previousProvider)
    restoreEnv('LLM_API_KEY', previousApiKey)
  }
})

Deno.test('provider selects OpenAI from LLM_PROVIDER', async () => {
  const previousProvider = Deno.env.get('LLM_PROVIDER')
  const previousApiKey = Deno.env.get('LLM_API_KEY')
  const previousModel = Deno.env.get('LLM_MODEL')
  const originalFetch = globalThis.fetch
  let request: Request | undefined
  Deno.env.set('LLM_PROVIDER', 'openai')
  Deno.env.set('LLM_API_KEY', 'secret-key')
  Deno.env.set('LLM_MODEL', 'gpt-4o-mini')
  globalThis.fetch = async (input, init) => {
    request = input instanceof Request ? input : new Request(input, init)
    return Response.json({ choices: [{ message: { content: 'Hello' } }] })
  }

  try {
    const result = await getLlmProvider().complete({
      messages: [{ role: 'user', content: 'Hello' }],
      tools: [],
    })
    assertEquals(result, { assistantText: 'Hello', toolCalls: [] })
    assertEquals(request?.url, 'https://api.openai.com/v1/chat/completions')
  } finally {
    globalThis.fetch = originalFetch
    restoreEnv('LLM_PROVIDER', previousProvider)
    restoreEnv('LLM_API_KEY', previousApiKey)
    restoreEnv('LLM_MODEL', previousModel)
  }
})
