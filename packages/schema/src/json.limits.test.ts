import { describe, expect, it } from 'vitest'

import { canonicalJSON } from './canonical.js'
import { JSON_LIMITS, JsonObjectSchema, JsonValueSchema, validateJsonValue } from './json.js'

const nest = (depth: number): unknown => {
  let value: unknown = 1
  for (let index = 0; index < depth; index += 1) value = { a: value }
  return value
}

/** Every route decides on a 400 by reading `safeParse(...).success`. */
describe('JSON validation reports failure instead of throwing', () => {
  it.each([1_000, 5_000, 50_000])(
    'returns a validation failure for a payload nested %i deep',
    (depth) => {
      const result = JsonValueSchema.safeParse(nest(depth))
      expect(result.success).toBe(false)
    },
  )

  it('names the depth limit in the failure', () => {
    const result = JsonValueSchema.safeParse(nest(JSON_LIMITS.maxDepth + 5))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/nests deeper/)
    }
  })

  it('accepts nesting inside the documented limit', () => {
    expect(JsonValueSchema.safeParse(nest(JSON_LIMITS.maxDepth - 2)).success).toBe(true)
  })

  it('returns a failure rather than looping forever on a cycle', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    const result = JsonValueSchema.safeParse(cyclic)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.message).toMatch(/cycle/)
  })

  it('rejects a wide payload above the node budget', () => {
    const wide = Object.fromEntries(
      Array.from({ length: JSON_LIMITS.maxNodes + 10 }, (_, index) => [String(index), 1]),
    )
    expect(JsonValueSchema.safeParse(wide).success).toBe(false)
  })

  it('rejects a string above the length budget', () => {
    const long = { note: 'a'.repeat(JSON_LIMITS.maxStringLength + 1) }
    expect(JsonObjectSchema.safeParse(long).success).toBe(false)
  })

  it('completes quickly on a deep payload rather than burning CPU', () => {
    const started = performance.now()
    JsonValueSchema.safeParse(nest(100_000))
    expect(performance.now() - started).toBeLessThan(2_000)
  })
})

describe('JSON validation keeps prototype pollution off the wire', () => {
  it('rejects an object carrying a __proto__ key', () => {
    const payload = JSON.parse('{"__proto__":{"polluted":true}}') as unknown
    expect(JsonObjectSchema.safeParse(payload).success).toBe(false)
  })

  it('rejects __proto__ nested inside an accepted object', () => {
    const payload = JSON.parse('{"filters":{"__proto__":{"polluted":true}}}') as unknown
    expect(JsonObjectSchema.safeParse(payload).success).toBe(false)
  })

  it('rejects a non-plain object', () => {
    expect(JsonObjectSchema.safeParse(new Map()).success).toBe(false)
  })
})

describe('JSON validation still accepts ordinary payloads', () => {
  it('accepts nested arrays, objects, and primitives', () => {
    expect(JsonValueSchema.parse({ a: [1, 'x', null, true] })).toEqual({
      a: [1, 'x', null, true],
    })
    expect(JsonObjectSchema.parse({ filters: { stage: 'Negotiation' } })).toEqual({
      filters: { stage: 'Negotiation' },
    })
  })

  it('rejects NaN and a non-object root for the object schema', () => {
    expect(JsonValueSchema.safeParse(Number.NaN).success).toBe(false)
    expect(JsonObjectSchema.safeParse(['not-an-object']).success).toBe(false)
  })

  it('reports the path of the offending value', () => {
    const failure = validateJsonValue({ filters: { stage: Number.NaN } })
    expect(failure?.path).toEqual(['filters', 'stage'])
  })
})

describe('canonical JSON is bounded and signature-safe', () => {
  it('throws a typed error rather than overflowing the stack', () => {
    expect(() => canonicalJSON(nest(JSON_LIMITS.maxDepth + 5))).toThrow(TypeError)
  })

  it('refuses a cyclic value', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => canonicalJSON(cyclic)).toThrow(/cyclic/)
  })

  it('refuses non-finite numbers instead of signing them as null', () => {
    // JSON.stringify renders NaN and Infinity as "null", so without this a configuration containing.
    expect(() => canonicalJSON({ ratio: Number.NaN })).toThrow(/finite/)
    expect(() => canonicalJSON({ ratio: Number.POSITIVE_INFINITY })).toThrow(/finite/)
  })

  it('gives negative zero and zero the same encoding', () => {
    expect(canonicalJSON({ value: -0 })).toBe(canonicalJSON({ value: 0 }))
  })

  it('orders keys deterministically regardless of insertion order', () => {
    expect(canonicalJSON({ b: 1, a: 2 })).toBe(canonicalJSON({ a: 2, b: 1 }))
  })

  it('still encodes an ordinary nested configuration', () => {
    expect(canonicalJSON({ tools: { export_records: { description: 'Export.' } } })).toBe(
      '{"tools":{"export_records":{"description":"Export."}}}',
    )
  })
})
