import { describe, expect, it } from 'vitest'

import { InMemoryConfigRepository, PostgresConfigStore, WingmanConfigStore } from './index'

describe('config package exports', () => {
  it('publishes only the supported composition surfaces', () => {
    expect(InMemoryConfigRepository).toBeTypeOf('function')
    expect(WingmanConfigStore).toBeTypeOf('function')
    expect(PostgresConfigStore).toBeTypeOf('function')
  })
})
