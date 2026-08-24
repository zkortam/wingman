import { describe, expect, it, vi } from 'vitest'

import { createAgentReplayHandler } from './replay'

const payload = {
  config: { systemPrompt: 'Help.', tools: {}, retrieval: {}, rules: [] },
  messages: [],
  sample: 0,
  interceptToolCalls: true,
}

describe('createAgentReplayHandler', () => {
  it('authenticates and fixes the execution count at zero', async () => {
    const run = vi.fn(async () => ({ toolCalls: [], text: 'safe', cassetteKey: 'host:0' }))
    const handler = createAgentReplayHandler({ token: 'runner-secret', run })
    const unauthorized = await handler(new Request('https://host/replay', {
      method: 'POST', body: JSON.stringify(payload),
    }))
    expect(unauthorized.status).toBe(401)
    expect(run).not.toHaveBeenCalled()

    const response = await handler(new Request('https://host/replay', {
      method: 'POST',
      headers: { authorization: 'Bearer runner-secret', 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      toolCalls: [], text: 'safe', cassetteKey: 'host:0', toolExecutions: 0,
    })
  })
})
