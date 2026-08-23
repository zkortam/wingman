import type { AgentConfig, Turn } from '@outcome/schema'
import { describe, expect, it } from 'vitest'

import { InMemoryCrm } from './crm'
import { DemoAgentRunner } from './runner'

const config = {
  systemPrompt: 'Use the active view filters for exports.',
  tools: [
    {
      name: 'export_records',
      description: 'Export the active view and preserve its filters.',
    },
  ],
  rules: [],
} as unknown as AgentConfig

const messages = [
  {
    role: 'user',
    text: 'Export these records',
    context: { viewFilters: { stage: 'Negotiation' } },
  },
] as unknown as Turn[]

describe('DemoAgentRunner', () => {
  it('intercepts a decision before any tool executes', async () => {
    const crm = new InMemoryCrm()
    const runner = new DemoAgentRunner({ crm })
    const before = crm.auditCount()

    const result = await runner.runTurn({
      config,
      messages,
      intercept: () => 'INTERCEPT',
    })

    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolExecutions).toBe(0)
    expect(crm.auditCount()).toBe(before)
  })

  it('reports execution honestly when the demo path allows it', async () => {
    const crm = new InMemoryCrm()
    const runner = new DemoAgentRunner({ crm })

    const result = await runner.runTurn({ config, messages })

    expect(result.toolExecutions).toBe(1)
    expect(crm.auditCount()).toBe(1)
  })

  it('keeps the cassette key stable for identical input', async () => {
    const runner = new DemoAgentRunner({ crm: new InMemoryCrm() })

    const first = await runner.runTurn({ config, messages, intercept: () => 'INTERCEPT' })
    const second = await runner.runTurn({ config, messages, intercept: () => 'INTERCEPT' })

    expect(first.cassetteKey).toBe(second.cassetteKey)
  })

  it('preserves five sampled decisions for an explicit variance fixture', async () => {
    const runner = new DemoAgentRunner({ crm: new InMemoryCrm() })
    const varianceMessages = [{ ...messages[0], context: { viewFilters: { stage: 'Negotiation' }, variance: true } }] as unknown as Turn[]
    const weakConfig = { ...config, tools: [{ name: 'export_records', description: 'Exports records.' }] } as unknown as AgentConfig
    const decisions = await Promise.all(Array.from({ length: 5 }, (_, sample) => runner.runTurn({ config: weakConfig, messages: varianceMessages, sample, intercept: () => 'INTERCEPT' })))
    const filters = decisions.map((decision) => JSON.stringify((decision.toolCalls[0] as unknown as { args: { filters: unknown } }).args.filters))
    expect(new Set(filters).size).toBe(2)
  })
})
