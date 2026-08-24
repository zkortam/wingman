import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { proxy } from './proxy'

describe('operator proxy', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('fails closed for production operator pages and accepts configured basic auth', () => {
    vi.stubEnv('WINGMAN_RUNTIME', 'production')
    vi.stubEnv('WINGMAN_OPERATOR_USERNAME', 'operator')
    vi.stubEnv('WINGMAN_OPERATOR_PASSWORD', 'correct horse')
    const denied = proxy(new NextRequest('https://wingman.example/inbox'))
    expect(denied.status).toBe(401)
    expect(denied.headers.get('www-authenticate')).toContain('Basic')

    const accepted = proxy(new NextRequest('https://wingman.example/inbox', {
      headers: { authorization: `Basic ${btoa('operator:correct horse')}` },
    }))
    expect(accepted.status).toBe(200)
  })

  it('leaves independently authenticated machine endpoints to their handlers', () => {
    vi.stubEnv('WINGMAN_RUNTIME', 'production')
    for (const path of [
      '/api/inngest',
      '/v1/events',
      '/v1/reviews/tool-calls',
      `/v1/config/agent/${'a'.repeat(32)}`,
    ]) {
      expect(proxy(new NextRequest(`https://wingman.example${path}`)).status).toBe(200)
    }
    expect(proxy(new NextRequest('https://wingman.example/v1/config/agent/versions')).status).toBe(503)
  })
})
