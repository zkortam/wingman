import type { AgentConfig, Turn } from '@outcome/schema'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { BASE_RUNTIME_CONFIG } from './agent/config'
import { InMemoryCrm } from './agent/crm'
import { DemoAgentRunner } from './agent/runner'

const readDefect = async (id: string): Promise<{ expected: { verdict: string } }> =>
  JSON.parse(await readFile(resolve(import.meta.dirname, `../defects/${id}.json`), 'utf8')) as { expected: { verdict: string } }

describe('Path B pipeline fixtures', () => {
  it('pins all four fixture verdicts without per-run tuning', async () => {
    const expected = new Map([
      ['OC-001', 'CONFIG_DEFECT'],
      ['OC-002', 'PREFERENCE'],
      ['OC-003', 'VARIANCE'],
      ['OC-004', 'CODE_DEFECT'],
    ])
    for (const [id, verdict] of expected) expect((await readDefect(id)).expected.verdict).toBe(verdict)
  })

  it('demonstrates fail-before and pass-after with zero executions', async () => {
    const runner = new DemoAgentRunner({ crm: new InMemoryCrm() })
    const messages = [{ role: 'user', text: 'Export these', context: { viewFilters: { stage: 'Negotiation' } } }] as unknown as Turn[]
    const broken = { ...BASE_RUNTIME_CONFIG, tools: BASE_RUNTIME_CONFIG.tools.map((tool) => tool.name === 'export_records' ? { ...tool, description: 'Exports records from the current object.' } : tool) } as unknown as AgentConfig
    const fixed = BASE_RUNTIME_CONFIG as unknown as AgentConfig

    const run = async (config: AgentConfig): Promise<{ passes: number; executions: number }> => {
      const results = await Promise.all(Array.from({ length: 5 }, (_, sample) => runner.runTurn({ config, messages, sample, intercept: () => 'INTERCEPT' })))
      return {
        passes: results.filter((result) => JSON.stringify((result.toolCalls[0] as unknown as { args: { filters: unknown } }).args.filters) === JSON.stringify({ stage: 'Negotiation' })).length,
        executions: results.reduce((sum, result) => sum + result.toolExecutions, 0),
      }
    }

    expect(await run(broken)).toEqual({ passes: 0, executions: 0 })
    expect(await run(fixed)).toEqual({ passes: 5, executions: 0 })
  })
})
