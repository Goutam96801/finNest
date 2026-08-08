export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export type ChatMessage = {
  role: ChatRole
  content: string
  toolCallId?: string
  name?: string
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
