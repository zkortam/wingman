import type { AgentConfig } from '@wingman/schema'
import { describe, expect, it, vi } from 'vitest'

import { HttpAgentRunner } from './http-runner'

const config: AgentConfig = { systemPrompt: 'Help.', tools: {}, retrieval: {}, rules: [] }

describe('HttpAgentRunner', () => {
  it('requests an intercepted replay without serializing an execution callback', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      expect(body).toMatchObject({ interceptToolCalls: true, sample: 2 })
      expect(JSON.stringify(body)).not.toContain('EXECUTE')
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer runner-secret')
      return Response.json({
        toolCalls: [{ name: 'search', args: { query: 'safe' } }],
        text: null,
        cassetteKey: 'remote:2',
        toolExecutions: 0,
      })
    })
    const runner = new HttpAgentRunner({
      endpoint: 'https://runner.example/replay',
      token: 'runner-secret',
      fetcher,
    })
    await expect(runner.runTurn({
      config,
      messages: [],
      intercept: () => 'INTERCEPT',
      sample: 2,
    })).resolves.toMatchObject({ cassetteKey: 'remote:2', toolExecutions: 0 })
  })

  it('rejects any remote claim that tools were executed', async () => {
    const runner = new HttpAgentRunner({
      endpoint: 'https://runner.example/replay',
      token: 'runner-secret',
      fetcher: vi.fn(async () => Response.json({
        toolCalls: [], text: null, cassetteKey: 'unsafe', toolExecutions: 1,
      })),
    })
    await expect(runner.runTurn({ config, messages: [], intercept: () => 'INTERCEPT' })).rejects.toThrow()
  })
})
