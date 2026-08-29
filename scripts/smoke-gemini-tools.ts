import { createGeminiProvider } from '../supabase/functions/_shared/llm/gemini.ts'
import { TOOL_DEFS } from '../supabase/functions/_shared/tools/catalog.ts'

const apiKey = Deno.env.get('GEMINI_API_KEY') ?? Deno.env.get('LLM_API_KEY')
if (!apiKey) {
  console.error('NO_KEY')
  Deno.exit(1)
}

const provider = createGeminiProvider(apiKey, 'gemini-flash-latest')
const result = await provider.complete({
  messages: [
    { role: 'system', content: 'You are Fynn. Prefer tools for user money data. Never invent balances.' },
    { role: 'user', content: 'Say hello briefly without tools.' },
  ],
  tools: TOOL_DEFS,
})
console.log(JSON.stringify({
  ok: true,
  text: result.assistantText?.slice(0, 120) ?? null,
  toolCalls: result.toolCalls.map((call) => call.name),
}))
