import { createGeminiProvider } from '../supabase/functions/_shared/llm/gemini.ts'

const apiKey = Deno.env.get('GEMINI_API_KEY') ?? Deno.env.get('LLM_API_KEY')
if (!apiKey) {
  console.error('NO_KEY')
  Deno.exit(1)
}

const models = [
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash-8b',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-lite',
  'gemini-2.5-flash-preview-05-20',
  'gemini-flash-latest',
  'gemini-pro',
]
for (const model of models) {
  const provider = createGeminiProvider(apiKey, model)
  try {
    const result = await provider.complete({
      messages: [
        { role: 'system', content: 'Reply with exactly OK.' },
        { role: 'user', content: 'ping' },
      ],
      tools: [],
    })
    console.log(JSON.stringify({ model, ok: true, text: result.assistantText?.slice(0, 80) ?? null }))
  } catch (error) {
    console.log(JSON.stringify({
      model,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }))
  }
}
