import { assertThrows } from 'jsr:@std/assert'
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
