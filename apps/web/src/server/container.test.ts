import { describe, expect, it } from 'vitest'

import { DEMO_AGENT, DEMO_REPORTER_HASH } from '../domain/demo'
import { commands, config, reader } from './container'
import { demoRuntime } from './demo-runtime'

describe('web composition root', () => {
  it('exposes only reader, command, and config ports to routes', async () => {
    demoRuntime.reset()
    expect(await reader.listIncidents()).toHaveLength(6)
    await commands.apply('OC-1042', 'USER')
    expect((await config.resolve(DEMO_AGENT, DEMO_REPORTER_HASH)).version).toBe(2)
    expect((await reader.listOutcomes()).map((outcome) => outcome.id)).toContain('OC-1042')
  })
})
