import { describe, expect, it } from 'vitest'

import { ReplayAppServerClient, WebSocketAppServerClient } from './app-server.js'

describe('Codex App Server adapters', () => {
  it('requires authenticated wss transport', () => {
    expect(() => new WebSocketAppServerClient('ws://localhost', 'token')).toThrow(/wss/)
    expect(() => new WebSocketAppServerClient('wss://localhost', '')).toThrow(/token/)
  })

  it('provides a credential-free replay handoff and writeback', async () => {
    const client = new ReplayAppServerClient()
    const payload = {
      task: 'Investigate',
      context: {
        failingAssertion: { kind: 'TOOL_CALLED' as const, tool: 'search' },
        failingRuns: [],
        affectedUsers: [],
        sessions: [],
        priorAttempts: [],
      },
      constraints: {
        maxIterations: 5 as const,
        requireTestPass: true as const,
      },
    }
    const { threadId } = await client.handoff(payload)
    await client.writeAgentsMd({ threadId, content: 'confirmed' })
    expect(client.handoffs).toEqual([payload])
    expect(client.writebacks).toEqual([{ threadId, content: 'confirmed' }])
  })
})
