import { describe, expect, it, vi } from 'vitest'

import { OpenAIEmbeddingClient } from './openai.js'

describe('OpenAIEmbeddingClient', () => {
  it('requests the exact dimensions and restores response index order', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        model: 'text-embedding-3-small',
        input: ['first', 'second'],
        dimensions: 1536,
        encoding_format: 'float',
      })
      return Response.json({
        data: [
          { index: 1, embedding: Array(1536).fill(2) },
          { index: 0, embedding: Array(1536).fill(1) },
        ],
      })
    })
    const client = new OpenAIEmbeddingClient({ apiKey: 'key', fetcher })
    const vectors = await client.embed({ texts: ['first', 'second'], dimensions: 1536 })
    expect(vectors[0]?.[0]).toBe(1)
    expect(vectors[1]?.[0]).toBe(2)
  })

  it('rejects malformed vectors and empty inputs before transport', async () => {
    const fetcher = vi.fn(async () => Response.json({ data: [{ index: 0, embedding: [1] }] }))
    const client = new OpenAIEmbeddingClient({ apiKey: 'key', fetcher })
    await expect(client.embed({ texts: ['text'], dimensions: 1536 })).rejects.toThrow('invalid')
    await expect(client.embed({ texts: [''], dimensions: 1536 })).rejects.toThrow('non-empty')
  })
})
