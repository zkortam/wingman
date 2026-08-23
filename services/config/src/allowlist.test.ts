import { describe, expect, it } from 'vitest'

import { assertWritable, ConfigMutationError } from './allowlist'

describe('assertWritable', () => {
  it('accepts only paths declared by the customer', () => {
    expect(() => assertWritable({ operations: [{ path: 'tools.export_records.description', value: 'safe' }] }, ['tools.*.description'], 4096)).not.toThrow()
    expect(() => assertWritable({ operations: [{ path: 'tools.export_records.handler', value: 'unsafe' }] }, ['tools.*.description'], 4096)).toThrow(ConfigMutationError)
  })

  it('enforces the hard byte cap independently of scope', () => {
    expect(() => assertWritable({ operations: [{ path: 'rules', value: 'x'.repeat(200) }] }, ['rules'], 32)).toThrow('DIFF_TOO_LARGE')
  })
})
