import { describe, expect, it } from 'vitest'

import { assertWritable, ConfigMutationError } from './allowlist'

describe('assertWritable', () => {
  it('accepts only paths declared by the customer', () => {
    expect(() =>
      assertWritable(
        { changes: [{ path: 'tools.export_records.description', before: 'old', after: 'safe' }] },
        ['tools.*.description'],
        4096,
      ),
    ).not.toThrow()
    expect(() =>
      assertWritable(
        { changes: [{ path: 'tools.export_records.handler', before: null, after: 'unsafe' }] },
        ['tools.*.description'],
        4096,
      ),
    ).toThrow(ConfigMutationError)
  })

  it('enforces the hard byte cap independently of scope', () => {
    expect(() =>
      assertWritable(
        { changes: [{ path: 'rules', before: [], after: ['x'.repeat(200)] }] },
        ['rules'],
        32,
      ),
    ).toThrow('DIFF_TOO_LARGE')
  })

  it('rejects malformed and overlapping diffs before checking policy', () => {
    expect(() => assertWritable({ operations: [] }, ['rules'], 4096)).toThrow()
    expect(() =>
      assertWritable(
        {
          changes: [
            { path: 'retrieval', before: {}, after: {} },
            { path: 'retrieval.topK', before: 5, after: 10 },
          ],
        },
        ['retrieval.*'],
        4096,
      ),
    ).toThrow()
  })
})
