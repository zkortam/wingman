import { describe, expect, it } from 'vitest'

import { AgentReplayRequestSchema, AgentReplayResponseSchema } from './replay'

describe('agent replay wire contract', () => {
  it('requires interception and a zero-execution response', () => {
    const base = {
      config: { systemPrompt: 'Help.', tools: {}, retrieval: {}, rules: [] },
      messages: [],
      interceptToolCalls: true,
    }
    expect(AgentReplayRequestSchema.safeParse(base).success).toBe(true)
    expect(AgentReplayRequestSchema.safeParse({ ...base, interceptToolCalls: false }).success).toBe(false)
    expect(AgentReplayResponseSchema.safeParse({
      toolCalls: [], text: null, cassetteKey: 'run:0', toolExecutions: 1,
    }).success).toBe(false)
  })
})
