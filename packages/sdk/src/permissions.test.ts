import { describe, expect, it } from 'vitest'

import { configChangeBytes, hasOnlyWritableChanges } from './permissions'

describe('hasOnlyWritableChanges', () => {
  const base = {
    systemPrompt: 'base',
    tools: { export_records: { description: 'old' } },
    retrieval: { reranker: { model: 'small' } },
    rules: [],
  }

  it('allows named tool descriptions and rejects every other field', () => {
    expect(hasOnlyWritableChanges(base, { ...base, tools: { export_records: { description: 'new' } } }, ['tools.*.description'])).toBe(true)
    expect(hasOnlyWritableChanges(base, { ...base, systemPrompt: 'changed' }, ['tools.*.description'])).toBe(false)
    expect(hasOnlyWritableChanges(base, { ...base, retrieval: { reranker: { model: 'large' } } }, ['retrieval.*'])).toBe(true)
  })

  it('measures only changed paths and values for the hard cap', () => {
    const small = { ...base, tools: { export_records: { description: 'new' } } }
    const large = { ...base, tools: { export_records: { description: 'x'.repeat(5_000) } } }
    expect(configChangeBytes(base, small)).toBeLessThan(200)
    expect(configChangeBytes(base, large)).toBeGreaterThan(4_096)
  })
})
