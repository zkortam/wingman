import { describe, expect, it } from 'vitest'

import { CassetteModelClient, CassetteStore, DemoAgentRunner, InMemoryCrm } from './index'

describe('fixtures package exports', () => {
  it('publishes the runner and deterministic model boundary', () => {
    expect(DemoAgentRunner).toBeTypeOf('function')
    expect(InMemoryCrm).toBeTypeOf('function')
    expect(CassetteStore).toBeTypeOf('function')
    expect(CassetteModelClient).toBeTypeOf('function')
  })
})
