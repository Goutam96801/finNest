export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export type ChatMessage = {
  role: ChatRole
  content: string
  toolCallId?: string
  name?: string
  /** Gemini thinking models require this to be echoed on later functionCall parts. */
  thoughtSignature?: string
}

export type ToolDef = {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type ToolCall = {
  id: string
  name: string
  arguments: Record<string, unknown>
  thoughtSignature?: string
}

export type CompleteResult = {
  assistantText?: string
  toolCalls: ToolCall[]
}

export interface LlmProvider {
  complete(input: {
    messages: ChatMessage[]
    tools: ToolDef[]
  }): Promise<CompleteResult>
}
