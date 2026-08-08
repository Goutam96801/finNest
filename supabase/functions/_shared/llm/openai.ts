import type { ChatMessage, CompleteResult, LlmProvider, ToolDef } from './types.ts'

type OpenAiToolCall = {
  id?: unknown
  function?: {
    name?: unknown
    arguments?: unknown
  }
}

type OpenAiResponse = {
  choices?: Array<{
    message?: {
      content?: unknown
      tool_calls?: OpenAiToolCall[]
    }
  }>
}

function parseArguments(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') return {}

  try {
    const parsed: unknown = JSON.parse(value)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function toOpenAiMessage(message: ChatMessage) {
  if (message.role === 'tool') {
    return {
      role: 'tool',
      tool_call_id: message.toolCallId ?? '',
      content: message.content,
    }
  }

  if (message.role === 'assistant' && message.name) {
    return {
      role: 'assistant',
      content: null,
      tool_calls: [{
        id: message.toolCallId ?? '',
        type: 'function',
        function: {
          name: message.name,
          arguments: message.content,
        },
      }],
    }
  }

  return { role: message.role, content: message.content }
}

function toTools(tools: ToolDef[]) {
  return tools.map(({ name, description, parameters }) => ({
    type: 'function',
    function: { name, description, parameters },
  }))
}

export function createOpenAiProvider(apiKey: string, model: string): LlmProvider {
  return {
    async complete({ messages, tools }): Promise<CompleteResult> {
      let response: Response
      try {
        response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: messages.map(toOpenAiMessage),
            ...(tools.length > 0 ? { tools: toTools(tools) } : {}),
          }),
        })
      } catch {
        throw new Error('OpenAI request failed due to a transport error')
      }

      if (!response.ok) {
        throw new Error(`OpenAI request failed with status ${response.status}`)
      }

      let payload: OpenAiResponse
      try {
        payload = await response.json() as OpenAiResponse
      } catch {
        throw new Error('OpenAI response could not be parsed')
      }

      const message = payload.choices?.[0]?.message
      const toolCalls = (message?.tool_calls ?? []).flatMap((toolCall, index) => {
        const name = toolCall.function?.name
        if (typeof name !== 'string') return []

        return [{
          id: typeof toolCall.id === 'string' && toolCall.id
            ? toolCall.id
            : `call_${name}_${index}`,
          name,
          arguments: parseArguments(toolCall.function?.arguments),
        }]
      })
      const assistantText = typeof message?.content === 'string' ? message.content : undefined

      return {
        ...(assistantText ? { assistantText } : {}),
        toolCalls,
      }
    },
  }
}
