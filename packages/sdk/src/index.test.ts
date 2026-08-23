import type { AgentConfig, SessionInput } from '@outcome/schema'
import { describe, expect, it, vi } from 'vitest'

import { Outcome } from './index'

const base = { systemPrompt: 'base', tools: [], rules: [] } as unknown as AgentConfig

describe('Outcome', () => {
  it('hashes identity before transport and exposes the four-method client', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/v1/config/')) return new Response('', { status: 503 })
      return new Response('', { status: 202 })
    })
    const client = Outcome.init({
      endpoint: 'https://outcome.test',
      apiKey: 'key',
      orgSalt: 'salt',
      signingKey: 'signing-key',
      baseConfig: base,
      defaultAgent: 'agent',
      writable: ['rules'],
      redact: { fields: ['intent'] },
      fetcher,
    })

    expect(await client.config({ agent: 'agent', userId: 'raw-user' })).toEqual(base)
    client.observe({ sessionId: 's1', userId: 'raw-user', intent: 'safe' } as unknown as SessionInput)
    await client.flush()
    expect(fetcher.mock.calls.map((call) => String(call[0])).join(' ')).not.toContain('raw-user')
    await expect(client.rules('raw-user')).resolves.toEqual([])
  })
})
