import { createGeminiProvider } from './gemini.ts'
import type { LlmProvider } from './types.ts'

export function getLlmProvider(): LlmProvider {
  const provider = (Deno.env.get('LLM_PROVIDER') ?? 'gemini').toLowerCase()
  const apiKey = Deno.env.get('LLM_API_KEY')
  if (!apiKey) throw new Error('LLM_API_KEY is not set')

  if (provider === 'gemini') {
    const model = Deno.env.get('LLM_MODEL') ?? 'gemini-2.0-flash'
    return createGeminiProvider(apiKey, model)
  }

  throw new Error(`Unsupported LLM_PROVIDER: ${provider}`)
}
