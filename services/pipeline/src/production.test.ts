import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createProductionPipelineControlPlane,
  createProductionPipelineFunctions,
  createProductionPipelineMaintenance,
} from './production'

describe('production pipeline control plane', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('fails explicitly when database credentials are absent', () => {
    vi.stubEnv('DATABASE_URL', '')
    expect(() => createProductionPipelineControlPlane()).toThrow('DATABASE_URL is required')
  })

  it('requires an explicit remote replay boundary for verification', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://wingman:wingman@localhost:5432/wingman')
    vi.stubEnv('OPENAI_API_KEY', 'openai-key')
    vi.stubEnv('WINGMAN_RUNNER_ENDPOINT', '')
    vi.stubEnv('WINGMAN_RUNNER_TOKEN', '')
    expect(() => createProductionPipelineFunctions()).toThrow('WINGMAN_RUNNER_ENDPOINT')
    expect(() => createProductionPipelineMaintenance()).not.toThrow()
  })
})
