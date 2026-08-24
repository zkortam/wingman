import type { AgentConfig, AgentRunner, ToolCall, Turn } from '@wingman/schema'

import { cassetteKey } from '../cassette'
import { runtimeConfig } from './config'
import { InMemoryCrm } from './crm'

interface RunnerOptions {
  crm: InMemoryCrm
}

const activeFilters = (messages: Turn[]): Record<string, unknown> => {
  const last = messages.at(-1) as unknown as { context?: { viewFilters?: Record<string, unknown> } }
  return last?.context?.viewFilters ?? {}
}

const isVarianceFixture = (messages: Turn[]): boolean => {
  const last = messages.at(-1) as unknown as { context?: { variance?: boolean } }
  return last.context?.variance === true
}

const exportDecision = (config: AgentConfig, messages: Turn[], sample: number): ToolCall => {
  const resolved = runtimeConfig(config)
  const description = resolved.tools.find((tool) => tool.name === 'export_records')?.description ?? ''
  const shouldPreserveFilters = /active view|preserve|visible view/i.test(description)
  const varianceAllowsFilters = isVarianceFixture(messages) && (sample === 2 || sample === 4)
  const filters = shouldPreserveFilters || varianceAllowsFilters ? activeFilters(messages) : {}
  return { name: 'export_records', args: { filters } } as ToolCall
}

export class DemoAgentRunner implements AgentRunner {
  readonly #crm: InMemoryCrm

  constructor(options: RunnerOptions) {
    this.#crm = options.crm
  }

  async runTurn(input: {
    config: AgentConfig
    messages: Turn[]
    intercept?: (call: ToolCall) => 'INTERCEPT' | 'EXECUTE'
    sample?: number
  }): Promise<{
    toolCalls: ToolCall[]
    text: string | null
    cassetteKey: string
    toolExecutions: number
  }> {
    const sample = input.sample ?? 0
    const request = { config: input.config, messages: input.messages }
    const call = exportDecision(input.config, input.messages, sample)
    const action = input.intercept?.(call) ?? 'EXECUTE'
    let toolExecutions = 0

    if (action === 'EXECUTE') {
      const args = call.args as { filters?: Record<string, unknown> }
      this.#crm.export(args.filters)
      toolExecutions += 1
    }

    return {
      toolCalls: [call],
      text: action === 'EXECUTE' ? 'Your export is ready.' : null,
      cassetteKey: cassetteKey(request),
      toolExecutions,
    }
  }
}
