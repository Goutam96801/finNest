import { createGeminiProvider } from './gemini.ts'
import { createOpenAiProvider } from './openai.ts'
import type { LlmProvider } from './types.ts'

export function getLlmProvider(): LlmProvider {
  const provider = (Deno.env.get('LLM_PROVIDER') ?? 'gemini').toLowerCase()
  if (provider !== 'gemini' && provider !== 'openai') {
    throw new Error(`Unsupported LLM_PROVIDER: ${provider}`)
  }

  const apiKey = Deno.env.get('LLM_API_KEY')
  if (!apiKey) throw new Error('LLM_API_KEY is not set')

  if (provider === 'openai') {
    return createOpenAiProvider(apiKey, Deno.env.get('LLM_MODEL') ?? 'gpt-4o-mini')
  }

  return createGeminiProvider(apiKey, Deno.env.get('LLM_MODEL') ?? 'gemini-2.0-flash')
}
