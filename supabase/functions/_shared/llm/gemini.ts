import type { ChatMessage, CompleteResult, LlmProvider, ToolDef } from './types.ts'

type GeminiFunctionCall = {
  id?: string
  name: string
  args: Record<string, unknown>
}

type GeminiPart =
  | { text: string; thoughtSignature?: string }
  | { functionCall: GeminiFunctionCall; thoughtSignature?: string }
  | {
    functionResponse: {
      id?: string
      name: string
      response: Record<string, unknown>
    }
    thoughtSignature?: string
  }

type GeminiContent = {
  role?: 'user' | 'model'
  parts: GeminiPart[]
}

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: unknown
        thoughtSignature?: unknown
        thought_signature?: unknown
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

function readThoughtSignature(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function toFunctionCallPart(message: ChatMessage): GeminiPart {
  return {
    functionCall: {
      ...(message.toolCallId ? { id: message.toolCallId } : {}),
      name: message.name ?? 'tool',
      args: parseObject(message.content) ?? {},
    },
    ...(message.thoughtSignature ? { thoughtSignature: message.thoughtSignature } : {}),
  }
}

function toFunctionResponsePart(message: ChatMessage): GeminiPart {
  return {
    functionResponse: {
      ...(message.toolCallId ? { id: message.toolCallId } : {}),
      name: message.name ?? 'tool',
      response: parseObject(message.content) ?? { content: message.content },
    },
  }
}

/**
 * Gemini expects parallel tool calls as one model turn (many functionCall parts),
 * then one user turn with matching functionResponse parts — including thoughtSignature.
 */
function toGeminiContents(messages: ChatMessage[]): GeminiContent[] {
  const contents: GeminiContent[] = []

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]

    if (message.role === 'assistant' && message.name) {
      const parts: GeminiPart[] = [toFunctionCallPart(message)]
      while (
        index + 1 < messages.length &&
        messages[index + 1].role === 'assistant' &&
        messages[index + 1].name
      ) {
        index += 1
        parts.push(toFunctionCallPart(messages[index]))
      }
      contents.push({ role: 'model', parts })
      continue
    }

    if (message.role === 'tool') {
      const parts: GeminiPart[] = [toFunctionResponsePart(message)]
      while (index + 1 < messages.length && messages[index + 1].role === 'tool') {
        index += 1
        parts.push(toFunctionResponsePart(messages[index]))
      }
      contents.push({ role: 'user', parts })
      continue
    }

    contents.push({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    })
  }

  return contents
}

function sanitizeSchemaForGemini(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSchemaForGemini(item))
  }
  if (value === null || typeof value !== 'object') {
    return value
  }

  const input = value as Record<string, unknown>
  const output: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(input)) {
    if (
      key === 'additionalProperties' ||
      key === 'exclusiveMinimum' ||
      key === 'exclusiveMaximum' ||
      key === '$schema' ||
      key === 'examples'
    ) {
      if (key === 'exclusiveMinimum' && typeof child === 'number' && output.minimum === undefined) {
        // Gemini schema doesn't support exclusiveMinimum; approximate with minimum.
        output.minimum = child
      }
      continue
    }
    output[key] = sanitizeSchemaForGemini(child)
  }
  return output
}

function toTools(tools: ToolDef[]) {
  if (tools.length === 0) return undefined

  return [
    {
      functionDeclarations: tools.map(({ name, description, parameters }) => ({
        name,
        description,
        parameters: sanitizeSchemaForGemini(parameters),
      })),
    },
  ]
}

export function createGeminiProvider(apiKey: string, model: string): LlmProvider {
  return {
    async complete({ messages, tools }): Promise<CompleteResult> {
      const systemMessages = messages.filter((message) => message.role === 'system')
      const contents = toGeminiContents(messages.filter((message) => message.role !== 'system'))
      const body = {
        ...(systemMessages.length > 0
          ? { systemInstruction: { parts: systemMessages.map(({ content }) => ({ text: content })) } }
          : {}),
        contents,
        ...(tools.length > 0 ? { tools: toTools(tools) } : {}),
      }
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
      let response: Response
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify(body),
        })
      } catch {
        throw new Error('Gemini request failed due to a transport error')
      }

      if (!response.ok) {
        let detail = ''
        try {
          detail = (await response.text()).slice(0, 500)
        } catch {
          detail = ''
        }
        if (response.status === 429) {
          throw new Error('Gemini quota exceeded (429). Wait or switch LLM_MODEL / plan.')
        }
        if (response.status === 404) {
          throw new Error(`Gemini model not found (404): ${model}. Set LLM_MODEL to a valid id (e.g. gemini-flash-latest).`)
        }
        throw new Error(
          detail
            ? `Gemini request failed with status ${response.status}: ${detail}`
            : `Gemini request failed with status ${response.status}`
        )
      }

      let payload: GeminiResponse
      try {
        payload = (await response.json()) as GeminiResponse
      } catch {
        throw new Error('Gemini response could not be parsed')
      }
      const parts = payload.candidates?.[0]?.content?.parts ?? []
      const assistantText = parts
        .filter((part): part is { text: string } => typeof part.text === 'string')
        .map((part) => part.text)
        .join('')
      const toolCalls = parts.flatMap((part) => {
        const functionCall = part.functionCall
        if (!functionCall || typeof functionCall.name !== 'string') return []
        const thoughtSignature = readThoughtSignature(part.thoughtSignature)
          ?? readThoughtSignature(part.thought_signature)

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
            ...(thoughtSignature ? { thoughtSignature } : {}),
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
