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

    const accepted = proxy(
      new NextRequest('https://wingman.example/inbox', {
        headers: { authorization: `Basic ${btoa('operator:correct horse')}` },
      }),
    )
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
    expect(proxy(new NextRequest('https://wingman.example/v1/config/agent/versions')).status).toBe(
      503,
    )
  })
})

/** Operator routes authenticate with HTTP Basic, which browsers replay automatically on cross-site. */
describe('operator proxy rejects cross-site state changes', () => {
  afterEach(() => vi.unstubAllEnvs())

  const configured = (): void => {
    vi.stubEnv('WINGMAN_RUNTIME', 'production')
    vi.stubEnv('WINGMAN_OPERATOR_USERNAME', 'operator')
    vi.stubEnv('WINGMAN_OPERATOR_PASSWORD', 'correct horse')
  }

  const credentials = { authorization: `Basic ${btoa('operator:correct horse')}` }

  it('rejects a POST a hostile page made, even with valid credentials', () => {
    configured()
    const response = proxy(
      new NextRequest('https://wingman.example/v1/incidents/OC-1/apply', {
        method: 'POST',
        headers: { ...credentials, 'sec-fetch-site': 'cross-site' },
      }),
    )
    expect(response.status).toBe(403)
  })

  it('rejects a cross-origin POST reported only by the Origin header', () => {
    configured()
    const response = proxy(
      new NextRequest('https://wingman.example/v1/incidents/OC-1/apply', {
        method: 'POST',
        headers: { ...credentials, origin: 'https://attacker.example' },
      }),
    )
    expect(response.status).toBe(403)
  })

  it('allows the operator console POST from its own origin', () => {
    configured()
    const response = proxy(
      new NextRequest('https://wingman.example/v1/incidents/OC-1/apply', {
        method: 'POST',
        headers: {
          ...credentials,
          'sec-fetch-site': 'same-origin',
          origin: 'https://wingman.example',
        },
      }),
    )
    expect(response.status).toBe(200)
  })

  it('allows a non-browser client that sends neither signal', () => {
    configured()
    const response = proxy(
      new NextRequest('https://wingman.example/v1/incidents/OC-1/apply', {
        method: 'POST',
        headers: credentials,
      }),
    )
    expect(response.status).toBe(200)
  })

  it('still reads cross-site GET traffic, which cannot change state', () => {
    configured()
    const response = proxy(
      new NextRequest('https://wingman.example/inbox', {
        headers: { ...credentials, 'sec-fetch-site': 'cross-site' },
      }),
    )
    expect(response.status).toBe(200)
  })

  it('rejects a cross-site POST before checking credentials at all', () => {
    configured()
    const response = proxy(
      new NextRequest('https://wingman.example/v1/incidents/OC-1/apply', {
        method: 'POST',
        headers: { 'sec-fetch-site': 'cross-site' },
      }),
    )
    expect(response.status).toBe(403)
  })
})
