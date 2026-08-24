import { describe, expect, it } from 'vitest'

import { BASE_RUNTIME_CONFIG, runtimeConfig } from './config'

describe('runtimeConfig', () => {
  it('fails open to a complete base config when input is malformed', () => {
    expect(runtimeConfig({ tools: 'invalid' })).toEqual(BASE_RUNTIME_CONFIG)
  })
})
