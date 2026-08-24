import { describe, expect, it } from 'vitest'

import { jsonError, readJsonObject } from './http'

describe('HTTP edge helpers', () => {
  it('rejects malformed and non-object JSON', async () => {
    await expect(readJsonObject(new Request('http://local', { method: 'POST', body: '{' }))).resolves.toBeNull()
    await expect(readJsonObject(new Request('http://local', { method: 'POST', body: '[]' }))).resolves.toBeNull()
    expect(jsonError(400, 'Invalid').status).toBe(400)
  })
})
