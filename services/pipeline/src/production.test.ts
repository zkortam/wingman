import { afterEach, describe, expect, it, vi } from 'vitest'

import { createProductionPipelineControlPlane, createProductionPipelineFunctions, createProductionPipelineMaintenance } from './production'

describe('production pipeline control plane', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('fails explicitly when database credentials are absent', () => {
    vi.stubEnv('SUPABASE_URL', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    expect(() => createProductionPipelineControlPlane()).toThrow(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required',
    )
  })

  it('requires an explicit remote replay boundary for verification', () => {
    vi.stubEnv('SUPABASE_URL', 'https://database.example')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role')
    vi.stubEnv('OPENAI_API_KEY', 'openai-key')
    vi.stubEnv('WINGMAN_RUNNER_ENDPOINT', '')
    vi.stubEnv('WINGMAN_RUNNER_TOKEN', '')
    expect(() => createProductionPipelineFunctions()).toThrow('WINGMAN_RUNNER_ENDPOINT')
    expect(() => createProductionPipelineMaintenance()).not.toThrow()
  })
})
