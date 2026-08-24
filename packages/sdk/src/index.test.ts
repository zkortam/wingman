import type { AgentConfig } from '@wingman/schema'
import { describe, expect, it, vi } from 'vitest'

import { Wingman } from './index'

const agentId = '4ee0d899-d63d-4bc2-b47a-25aa25c6078b'
const base: AgentConfig = { systemPrompt: 'base', tools: {}, retrieval: {}, rules: [] }

describe('Wingman', () => {
  it('hashes identity before transport and exposes the production client', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/v1/config/')) return new Response('', { status: 503 })
      return new Response('', { status: 202 })
    })
    const client = Wingman.init({
      endpoint: 'https://wingman.test',
      apiKey: 'key',
      orgId: '5e8e68e1-a768-4342-b4f4-d9a1f8ceaa26',
      orgSalt: 'salt',
      signingKey: 'signing-key',
      baseConfig: base,
      defaultAgent: agentId,
      writable: ['rules'],
      redact: { fields: ['turns'] },
      fetcher,
    })

    expect(await client.config({ agent: agentId, userId: 'raw-user' })).toEqual(base)
    client.observeSession({
      id: 'f561f9b9-2abf-4bb7-a5cd-3b6ad76002b6',
      userId: 'raw-user',
      startedAt: '2026-08-23T20:00:00.000Z',
      turns: [
        {
          idx: 0,
          role: 'user',
          text: 'safe',
          toolCalls: [],
          createdAt: '2026-08-23T20:00:00.000Z',
        },
      ],
    })
    expect(client.observationStats()).toMatchObject({ queued: 1, sent: 0, failed: 0, dropped: 0 })
    await client.flush()
    expect(client.observationStats()).toMatchObject({ queued: 0, sent: 1, failed: 0, dropped: 0 })
    expect(fetcher.mock.calls.map((call) => String(call[0])).join(' ')).not.toContain('raw-user')
    await expect(client.rules('raw-user')).resolves.toEqual([])
  })
})
