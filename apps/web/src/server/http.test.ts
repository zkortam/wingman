import { afterEach, describe, expect, it, vi } from 'vitest'

import { isSdkAuthorized, jsonError, operatorError, readJsonObject } from './http'

describe('HTTP edge helpers', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('rejects malformed and non-object JSON', async () => {
    await expect(readJsonObject(new Request('http://local', { method: 'POST', body: '{' }))).resolves.toBeNull()
    await expect(readJsonObject(new Request('http://local', { method: 'POST', body: '[]' }))).resolves.toBeNull()
    expect(jsonError(400, 'Invalid').status).toBe(400)
  })

  it('requires the exact bearer credential in production', () => {
    vi.stubEnv('WINGMAN_RUNTIME', 'production')
    vi.stubEnv('WINGMAN_API_KEY', 'production-secret')
    expect(isSdkAuthorized(new Request('https://wingman.test'))).toBe(false)
    expect(isSdkAuthorized(new Request('https://wingman.test', { headers: { authorization: 'Bearer wrong' } }))).toBe(false)
    expect(isSdkAuthorized(new Request('https://wingman.test', { headers: { authorization: 'Bearer production-secret' } }))).toBe(true)
  })

  it('separates command conflicts and missing rows from service outages', () => {
    expect(operatorError(new Error('Cannot reopen incident in APPLIED'), {
      conflict: /Cannot reopen/,
    }).status).toBe(409)
    expect(operatorError(new Error('row missing', {
      cause: { code: 'PGRST116' },
    }), { notFoundMessage: 'Incident not found' }).status).toBe(404)
    expect(operatorError(new Error('database unavailable')).status).toBe(503)
  })
})
