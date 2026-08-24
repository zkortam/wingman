import { describe, expect, it } from 'vitest'

import { canonicalJSON, signConfig } from './canonical.js'
import type { AgentConfig } from './config.js'

// DATA-MODEL.md §8.
const AWKWARD: ReadonlyArray<readonly [string, unknown, string]> = [
  ['empty object', {}, '{}'],
  ['empty array', [], '[]'],
  ['nested empty objects', { a: {}, b: [{}] }, '{"a":{},"b":[{}]}'],
  ['null', null, 'null'],
  ['negative zero', -0, '0'],
  ['1e21', 1e21, '1e+21'],
  ['small exponent', 1e-7, '1e-7'],
  ['max safe integer', Number.MAX_SAFE_INTEGER, '9007199254740991'],
  ['float', 0.1, '0.1'],
  ['true', true, 'true'],
  ['empty string', '', '""'],
  ['string with quotes', 'a"b\\c', '"a\\"b\\\\c"'],
  ['newline', 'a\nb', '"a\\nb"'],
  ['unicode value', 'café → ☕', '"café → ☕"'],
  ['unicode keys', { é: 1, z: 2, a: 3 }, '{"a":3,"z":2,"é":1}'],
  // Sorting is by UTF-16 code unit, NOT locale collation.
  ['mixed case keys', { a: 1, B: 2, c: 3 }, '{"B":2,"a":1,"c":3}'],
  ['digit and letter keys', { '10': 1, '9': 2, a: 3 }, '{"10":1,"9":2,"a":3}'],
  ['undefined dropped in object', { a: undefined, b: 1 }, '{"b":1}'],
  ['undefined becomes null in array', [1, undefined, 2], '[1,null,2]'],
  ['deeply nested arrays', [[[[1, [2, [3]]]]]], '[[[[1,[2,[3]]]]]]'],
  ['array order preserved', { filters: ['status', 'owner'] }, '{"filters":["status","owner"]}'],
]

describe('canonicalJSON', () => {
  it.each(AWKWARD.map(([label, value, expected]) => ({ label, value, expected })))(
    'encodes $label',
    ({ value, expected }) => {
      expect(canonicalJSON(value)).toBe(expected)
    },
  )

  it('sorts keys by code unit rather than locale collation', () => {
    expect(canonicalJSON({ a: 1, B: 2, c: 3 })).toBe('{"B":2,"a":1,"c":3}')
    // A verifier using localeCompare would order these a, B, c, sign different bytes, reject every.
    expect(['B', 'a', 'c'].sort((left, right) => left.localeCompare(right))).toEqual([
      'a',
      'B',
      'c',
    ])
  })

  it('is stable regardless of key insertion order', () => {
    expect(canonicalJSON({ b: 1, a: 2 })).toBe(canonicalJSON({ a: 2, b: 1 }))
  })

  it.each([
    ['Date', new Date(0)],
    ['Map', new Map()],
    ['Set', new Set()],
    ['RegExp', /pattern/],
    ['null-prototype object', Object.create(null)],
  ])('throws on %s', (_label, value) => {
    expect(() => canonicalJSON(value)).toThrow(TypeError)
  })

  // Previously these encoded as null, following JSON.stringify.
  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ])('refuses to sign %s rather than encoding it as null', (_label, value) => {
    expect(() => canonicalJSON(value)).toThrow(/finite/)
  })

  it('no longer collides a non-finite number with null', () => {
    expect(canonicalJSON({ ratio: null })).toBe('{"ratio":null}')
    expect(() => canonicalJSON({ ratio: Number.NaN })).toThrow()
  })
})

describe('signConfig', () => {
  const config: AgentConfig = {
    systemPrompt: 'Base prompt',
    tools: { export_records: { description: 'Export records' } },
    retrieval: {},
    rules: [],
  }

  it('is hmac-sha256 over agentId.version.canonicalJSON(config)', () => {
    expect(signConfig('key', 'agent', 2, config)).toBe(
      'ca6c50dc400d5486fa2a16dc846f1aef651ac0458108fc332205061f6c610227',
    )
  })

  it('changes when any component changes', () => {
    const base = signConfig('key', 'agent', 2, config)
    expect(signConfig('key2', 'agent', 2, config)).not.toBe(base)
    expect(signConfig('key', 'agent2', 2, config)).not.toBe(base)
    expect(signConfig('key', 'agent', 3, config)).not.toBe(base)
    expect(signConfig('key', 'agent', 2, { ...config, systemPrompt: 'other' })).not.toBe(base)
  })
})
