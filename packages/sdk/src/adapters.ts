import type { JsonValue, ToolCallReviewDecision } from '@wingman/schema'

import type { ReviewToolCallInput } from './review.js'

export interface ToolReviewHost {
  reviewToolCall(input: ReviewToolCallInput): Promise<ToolCallReviewDecision>
}

type JsonRecord = Record<string, JsonValue>

export interface HostToolCall {
  name: string
  args?: JsonRecord
}

/**
 * Thin, dependency-free translations into `reviewToolCall`.
 *
 * Framework adapters must not monkey-patch SDKs or execute tools. They intercept
 * a proposed call, ask Wingman, and return the host's next action.
 */
export const createToolMiddleware = (wingman: ToolReviewHost) => {
  const review = async (
    input: Omit<ReviewToolCallInput, 'proposedCall'> & { proposedCall: HostToolCall },
  ): Promise<ToolCallReviewDecision> =>
    wingman.reviewToolCall({
      ...input,
      proposedCall: { name: input.proposedCall.name, args: input.proposedCall.args ?? {} },
    })

  return {
    review,
    async beforeLangChainTool(
      input: Omit<ReviewToolCallInput, 'proposedCall'> & { toolName: string; toolInput: unknown },
    ): Promise<ToolCallReviewDecision> {
      return review({
        ...input,
        proposedCall: {
          name: input.toolName,
          args: asArgs(input.toolInput),
        },
      })
    },
    async beforeVercelTool(
      input: Omit<ReviewToolCallInput, 'proposedCall'> & { toolName: string; args: unknown },
    ): Promise<ToolCallReviewDecision> {
      return review({
        ...input,
        proposedCall: { name: input.toolName, args: asArgs(input.args) },
      })
    },
    async beforeOpenAIAgentTool(
      input: Omit<ReviewToolCallInput, 'proposedCall'> & { toolName: string; arguments: unknown },
    ): Promise<ToolCallReviewDecision> {
      return review({
        ...input,
        proposedCall: { name: input.toolName, args: asArgs(input.arguments) },
      })
    },
  }
}

const asArgs = (value: unknown): JsonRecord => {
  if (isJsonRecord(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value)
      if (isJsonRecord(parsed)) return parsed
    } catch {
      return { value }
    }
    return { value }
  }
  if (value === undefined) return {}
  if (isJsonValue(value)) return { value }
  return {}
}

const isJsonRecord = (value: unknown): value is JsonRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value).every(isJsonValue)
}

const isJsonValue = (value: unknown): value is JsonValue => {
  if (value === null) return true
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.every(isJsonValue)
  if (typeof value === 'object') return Object.values(value).every(isJsonValue)
  return false
}
