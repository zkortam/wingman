import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEMO_AGENT, DEMO_REPORTER_HASH } from '../domain/demo'
import { commands, config, reader } from './container'
import { demoRuntime } from './demo-runtime'

describe('web composition root', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('exposes only reader, command, and config ports to routes', async () => {
    vi.stubEnv('WINGMAN_RUNTIME', 'demo')
    demoRuntime.reset()
    expect(await reader.listIncidents()).toHaveLength(6)
    await commands.apply('OC-1042', 'USER')
    expect((await config.resolve(DEMO_AGENT, DEMO_REPORTER_HASH)).version).toBe(2)
    expect((await reader.listOutcomes()).map((outcome) => outcome.id)).toContain('OC-1042')
    await commands.confirm('OC-1042')
    expect(demoRuntime.incident('OC-1042')?.state).toBe('CONFIRMED')
    await expect(reader.gatePrecision()).resolves.toEqual({ precision: 1, n: 6 })
  })

  it('never falls back to demo data in production', async () => {
    vi.stubEnv('WINGMAN_RUNTIME', 'production')
    vi.stubEnv('SUPABASE_URL', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    await expect(reader.listIncidents()).rejects.toThrow('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  })
})
