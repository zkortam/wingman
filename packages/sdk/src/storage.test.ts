import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { FileConfigStorage } from './storage'

describe('FileConfigStorage', () => {
  it('persists a last-known-good value across instances without exposing the key as a filename', () => {
    const directory = mkdtempSync(join(tmpdir(), 'wingman-storage-'))
    new FileConfigStorage(directory).set('agent:user-hash', 'signed-config')
    expect(new FileConfigStorage(directory).get('agent:user-hash')).toBe('signed-config')
    expect(new FileConfigStorage(directory).get('unknown')).toBeUndefined()
  })
})
