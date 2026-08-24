import { z } from 'zod'

export type JsonPrimitive = boolean | number | string | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export const JsonPrimitiveSchema = z.union([z.boolean(), z.number().finite(), z.string(), z.null()])

/** Structural limits on any JSON value crossing the wire. */
export const JSON_LIMITS = {
  /** Nesting levels. Real tool arguments are shallow; 64 is generous. */
  maxDepth: 64,
  /** Total values, so a wide-but-shallow payload is bounded too. */
  maxNodes: 100_000,
  /** Characters in one string value. */
  maxStringLength: 1_000_000,
} as const

interface Frame {
  value: unknown
  depth: number
  path: (string | number)[]
}

interface JsonFailure {
  path: (string | number)[]
  message: string
}

/** Validates a JSON value iteratively. */
export function validateJsonValue(root: unknown): JsonFailure | null {
  const stack: Frame[] = [{ value: root, depth: 0, path: [] }]
  const seen = new Set<object>()
  let nodes = 0

  while (stack.length > 0) {
    const frame = stack.pop()
    if (frame === undefined) break
    const { value, depth, path } = frame

    nodes += 1
    if (nodes > JSON_LIMITS.maxNodes) {
      return { path, message: `JSON value exceeds ${String(JSON_LIMITS.maxNodes)} nodes` }
    }
    if (depth > JSON_LIMITS.maxDepth) {
      return {
        path,
        message: `JSON value nests deeper than ${String(JSON_LIMITS.maxDepth)} levels`,
      }
    }

    if (value === null) continue
    const type = typeof value
    if (type === 'boolean') continue
    if (type === 'string') {
      if ((value as string).length > JSON_LIMITS.maxStringLength) {
        return {
          path,
          message: `String exceeds ${String(JSON_LIMITS.maxStringLength)} characters`,
        }
      }
      continue
    }
    if (type === 'number') {
      if (!Number.isFinite(value)) {
        return { path, message: 'Expected a finite number' }
      }
      continue
    }
    if (type !== 'object') {
      return { path, message: `Expected a JSON value, received ${type}` }
    }

    if (seen.has(value as object)) {
      return { path, message: 'JSON value contains a cycle' }
    }
    seen.add(value as object)

    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        stack.push({ value: value[index], depth: depth + 1, path: [...path, index] })
      }
      continue
    }
    const prototype: unknown = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      return { path, message: 'Expected a plain JSON object' }
    }
    for (const key of Object.keys(value as Record<string, unknown>)) {
      // `__proto__` is never legitimate wire data and is the standard vector for polluting a prototype.
      if (key === '__proto__') {
        return { path: [...path, key], message: 'The key __proto__ is not permitted' }
      }
      stack.push({
        value: (value as Record<string, unknown>)[key],
        depth: depth + 1,
        path: [...path, key],
      })
    }
  }
  return null
}

const jsonCheck = (value: unknown, context: z.RefinementCtx): void => {
  const failure = validateJsonValue(value)
  if (failure !== null) {
    context.addIssue({ code: 'custom', message: failure.message, path: failure.path })
  }
}

export const JsonValueSchema = z.unknown().superRefine(jsonCheck) as unknown as z.ZodType<JsonValue>

export const JsonObjectSchema = z.unknown().superRefine((value, context) => {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    context.addIssue({ code: 'custom', message: 'Expected a JSON object' })
    return
  }
  jsonCheck(value, context)
}) as unknown as z.ZodType<Record<string, JsonValue>>

export type JsonObject = Record<string, JsonValue>
