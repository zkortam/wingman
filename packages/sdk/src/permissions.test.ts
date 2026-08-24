import { diffConfigs, isConfigPathWritable } from '@wingman/schema'
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
    expect(
      hasOnlyWritableChanges(base, { ...base, tools: { export_records: { description: 'new' } } }, [
        'tools.*.description',
      ]),
    ).toBe(true)
    expect(
      hasOnlyWritableChanges(base, { ...base, systemPrompt: 'changed' }, ['tools.*.description']),
    ).toBe(false)
    // diffConfigs reports `retrieval` atomically, and a trailing wildcard grants strictly-below paths.
    expect(
      hasOnlyWritableChanges(base, { ...base, retrieval: { reranker: { model: 'large' } } }, [
        'retrieval.*',
      ]),
    ).toBe(false)
    expect(
      hasOnlyWritableChanges(base, { ...base, retrieval: { reranker: { model: 'large' } } }, [
        'retrieval',
      ]),
    ).toBe(true)
  })

  /** The host and the control plane enforce one allowlist. */
  it('agrees with the server about which paths a change touches', () => {
    const candidate = { ...base, tools: { export_records: { description: 'new' } } }
    const serverPaths = diffConfigs(base, candidate)?.changes.map(({ path }) => path) ?? []
    expect(serverPaths).toEqual(['tools.export_records.description'])
    for (const allow of [['tools.*.description'], ['tools.*'], ['rules']]) {
      const server = serverPaths.every((path) =>
        allow.some((entry) => isConfigPathWritable(path, entry)),
      )
      expect(hasOnlyWritableChanges(base, candidate, allow)).toBe(server)
    }
  })

  it('measures only changed paths and values for the hard cap', () => {
    const small = { ...base, tools: { export_records: { description: 'new' } } }
    const large = { ...base, tools: { export_records: { description: 'x'.repeat(5_000) } } }
    expect(configChangeBytes(base, small)).toBeLessThan(200)
    expect(configChangeBytes(base, large)).toBeGreaterThan(4_096)
  })
})
