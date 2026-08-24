import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiClient, ApiError } from './api-client'

describe('apiClient', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('centralizes successful JSON requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })),
    )
    await expect(apiClient.listIncidents()).resolves.toEqual([])
  })

  it('maps non-success status into one error type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 })),
    )
    await expect(apiClient.listIncidents()).rejects.toBeInstanceOf(ApiError)
  })

  it('accepts an empty successful response for commands', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    )
    await expect(apiClient.dismiss('OC-1042', 'Handled elsewhere')).resolves.toBeUndefined()
  })
})
