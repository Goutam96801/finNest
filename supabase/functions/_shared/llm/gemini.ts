import type { ChatMessage, CompleteResult, LlmProvider, ToolDef } from './types.ts'

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } }

type GeminiContent = {
  role?: 'user' | 'model'
  parts: GeminiPart[]
}

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: unknown
        functionCall?: {
          name?: unknown
          args?: unknown
          id?: unknown
        }
      }>
    }
  }>
}

function parseObject(content: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(content)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // The caller may send a plain-text tool result.
  }

  return undefined
}

function toGeminiContent(message: ChatMessage): GeminiContent {
  if (message.role === 'tool') {
    return {
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: message.name ?? 'tool',
            response: parseObject(message.content) ?? { content: message.content },
          },
        },
      ],
    }
  }

  if (message.role === 'assistant' && message.name) {
    return {
      role: 'model',
      parts: [
        {
          functionCall: {
            name: message.name,
            args: parseObject(message.content) ?? {},
          },
        },
      ],
    }
  }

  return {
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }
}

function toTools(tools: ToolDef[]) {
  if (tools.length === 0) return undefined

  return [
    {
      functionDeclarations: tools.map(({ name, description, parameters }) => ({
        name,
        description,
        parameters,
      })),
    },
  ]
}

export function createGeminiProvider(apiKey: string, model: string): LlmProvider {
  return {
    async complete({ messages, tools }): Promise<CompleteResult> {
      const systemMessages = messages.filter((message) => message.role === 'system')
      const contents = messages
        .filter((message) => message.role !== 'system')
        .map(toGeminiContent)
      const body = {
        ...(systemMessages.length > 0
          ? { systemInstruction: { parts: systemMessages.map(({ content }) => ({ text: content })) } }
          : {}),
        contents,
        ...(tools.length > 0 ? { tools: toTools(tools) } : {}),
      }
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        throw new Error(`Gemini request failed with status ${response.status}`)
      }

      const payload = (await response.json()) as GeminiResponse
      const parts = payload.candidates?.[0]?.content?.parts ?? []
      const assistantText = parts
        .filter((part): part is { text: string } => typeof part.text === 'string')
        .map((part) => part.text)
        .join('')
      const toolCalls = parts.flatMap((part) => {
        const functionCall = part.functionCall
        if (!functionCall || typeof functionCall.name !== 'string') return []

        return [
          {
            id: typeof functionCall.id === 'string' ? functionCall.id : '',
            name: functionCall.name,
            arguments:
              functionCall.args !== null &&
              typeof functionCall.args === 'object' &&
              !Array.isArray(functionCall.args)
                ? (functionCall.args as Record<string, unknown>)
                : {},
          },
        ]
      })
      toolCalls.forEach((toolCall, index) => {
        if (!toolCall.id) toolCall.id = `call_${toolCall.name}_${index}`
      })

      return {
        ...(assistantText ? { assistantText } : {}),
        toolCalls,
      }
    },
  }
}
