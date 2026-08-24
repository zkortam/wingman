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

/** Thin, dependency-free translations into `reviewToolCall`. */
export const createToolMiddleware = (wingman: ToolReviewHost) => {
  const review = async (
    input: Omit<ReviewToolCallInput, 'proposedCall'> & { proposedCall: HostToolCall },
  ): Promise<ToolCallReviewDecision> =>
    wingman.reviewToolCall({
      ...input,
      proposedCall: { name: input.proposedCall.name, args: input.proposedCall.args ?? {} },
    })

  /** Reviewing a call whose arguments could not be represented would show the reviewer a different. */
  const reviewNormalized = async (
    input: Omit<ReviewToolCallInput, 'proposedCall'>,
    toolName: string,
    raw: unknown,
  ): Promise<ToolCallReviewDecision> => {
    const normalized = toArgs(raw)
    if (!normalized.ok) {
      return {
        action: 'ESCALATE',
        reason: `The proposed arguments for ${toolName} could not be represented as JSON (${normalized.reason}), so they could not be reviewed.`,
        instruction:
          'Serialize the tool arguments to JSON before review, or approve this call manually.',
        confidence: 1,
        source: 'POLICY',
      }
    }
    return review({ ...input, proposedCall: { name: toolName, args: normalized.args } })
  }

  return {
    review,
    async beforeLangChainTool(
      input: Omit<ReviewToolCallInput, 'proposedCall'> & { toolName: string; toolInput: unknown },
    ): Promise<ToolCallReviewDecision> {
      const { toolName, toolInput, ...rest } = input
      return reviewNormalized(rest, toolName, toolInput)
    },
    async beforeVercelTool(
      input: Omit<ReviewToolCallInput, 'proposedCall'> & { toolName: string; args: unknown },
    ): Promise<ToolCallReviewDecision> {
      const { toolName, args, ...rest } = input
      return reviewNormalized(rest, toolName, args)
    },
    async beforeOpenAIAgentTool(
      input: Omit<ReviewToolCallInput, 'proposedCall'> & { toolName: string; arguments: unknown },
    ): Promise<ToolCallReviewDecision> {
      const { toolName, arguments: args, ...rest } = input
      return reviewNormalized(rest, toolName, args)
    },
  }
}

type ArgsResult = { ok: true; args: JsonRecord } | { ok: false; reason: string }

/** Normalizes a framework's tool input into the JSON record the reviewer sees. */
export const toArgs = (value: unknown): ArgsResult => {
  if (value === undefined || value === null) return { ok: true, args: {} }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(trimmed)
        const normalized = toJson(parsed)
        if (normalized.ok && isRecord(normalized.value)) {
          return { ok: true, args: normalized.value }
        }
      } catch {
        // Not JSON after all; fall through to the opaque-value representation.
      }
    }
    return { ok: true, args: { value } }
  }
  const normalized = toJson(value)
  if (!normalized.ok) return normalized
  if (isRecord(normalized.value)) return { ok: true, args: normalized.value }
  return { ok: true, args: { value: normalized.value } }
}

type JsonResult = { ok: true; value: JsonValue } | { ok: false; reason: string }

const isRecord = (value: JsonValue): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const toJson = (value: unknown, depth = 0): JsonResult => {
  if (depth > 64) return { ok: false, reason: 'nested beyond 64 levels' }
  if (value === null) return { ok: true, value: null }
  const type = typeof value
  if (type === 'string' || type === 'boolean') return { ok: true, value: value as JsonValue }
  if (type === 'number') {
    return Number.isFinite(value)
      ? { ok: true, value: value as number }
      : { ok: false, reason: 'a non-finite number' }
  }
  if (type === 'bigint') return { ok: false, reason: 'a bigint' }
  if (type === 'function') return { ok: false, reason: 'a function' }
  if (type === 'symbol') return { ok: false, reason: 'a symbol' }
  if (type !== 'object') return { ok: false, reason: `a ${type}` }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? { ok: false, reason: 'an invalid Date' }
      : { ok: true, value: value.toISOString() }
  }
  if (Array.isArray(value)) {
    const items: JsonValue[] = []
    for (const entry of value) {
      // A hole or an explicit `undefined` in an array is JSON `null`, matching what JSON.stringify would.
      if (entry === undefined) {
        items.push(null)
        continue
      }
      const normalized = toJson(entry, depth + 1)
      if (!normalized.ok) return normalized
      items.push(normalized.value)
    }
    return { ok: true, value: items }
  }

  // A Map, Set, or class instance reports no own enumerable entries, so accepting it here would.
  const prototype: unknown = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    return { ok: false, reason: `a ${(value as object).constructor?.name ?? 'non-plain'} instance` }
  }

  const record: JsonRecord = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === undefined) continue
    const normalized = toJson(entry, depth + 1)
    if (!normalized.ok) return normalized
    record[key] = normalized.value
  }
  return { ok: true, value: record }
}
