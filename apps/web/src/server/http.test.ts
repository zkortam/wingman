import { afterEach, describe, expect, it, vi } from 'vitest'

import { isSdkAuthorized, jsonError, operatorError, readJsonObject } from './http'

describe('HTTP edge helpers', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('rejects malformed and non-object JSON', async () => {
    await expect(
      readJsonObject(new Request('http://local', { method: 'POST', body: '{' })),
    ).resolves.toBeNull()
    await expect(
      readJsonObject(new Request('http://local', { method: 'POST', body: '[]' })),
    ).resolves.toBeNull()
    expect(jsonError(400, 'Invalid').status).toBe(400)
  })

  it('requires the exact bearer credential in production', () => {
    vi.stubEnv('WINGMAN_RUNTIME', 'production')
    vi.stubEnv('WINGMAN_API_KEY', 'production-secret')
    expect(isSdkAuthorized(new Request('https://wingman.test'))).toBe(false)
    expect(
      isSdkAuthorized(
        new Request('https://wingman.test', { headers: { authorization: 'Bearer wrong' } }),
      ),
    ).toBe(false)
    expect(
      isSdkAuthorized(
        new Request('https://wingman.test', {
          headers: { authorization: 'Bearer production-secret' },
        }),
      ),
    ).toBe(true)
  })

  it('separates command conflicts and missing rows from service outages', () => {
    expect(
      operatorError(new Error('Cannot reopen incident in APPLIED'), {
        conflict: /Cannot reopen/,
      }).status,
    ).toBe(409)
    expect(
      operatorError(
        new Error('row missing', {
          cause: { code: 'PGRST116' },
        }),
        { notFoundMessage: 'Incident not found' },
      ).status,
    ).toBe(404)
    expect(operatorError(new Error('database unavailable')).status).toBe(503)
  })
})

/** `Request.json()` parses any body regardless of its declared type, so an HTML form posting. */
describe('readJsonObject requires a declared JSON body', () => {
  const body = JSON.stringify({ scope: 'GLOBAL' })

  it('reads a properly declared JSON object', async () => {
    const request = new Request('http://local', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
    await expect(readJsonObject(request)).resolves.toEqual({ scope: 'GLOBAL' })
  })

  it('accepts a charset parameter on the content type', async () => {
    const request = new Request('http://local', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body,
    })
    await expect(readJsonObject(request)).resolves.toEqual({ scope: 'GLOBAL' })
  })

  it.each(['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data'])(
    'refuses a body declared as %s even when it parses as JSON',
    async (contentType) => {
      const request = new Request('http://local', {
        method: 'POST',
        headers: { 'content-type': contentType },
        body,
      })
      await expect(readJsonObject(request)).resolves.toBeNull()
    },
  )

  it('refuses a body with no content type at all', async () => {
    const request = new Request('http://local', { method: 'POST', body })
    await expect(readJsonObject(request)).resolves.toBeNull()
  })

  it('refuses a JSON array, which is not an object body', async () => {
    const request = new Request('http://local', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '[1,2]',
    })
    await expect(readJsonObject(request)).resolves.toBeNull()
  })
})
