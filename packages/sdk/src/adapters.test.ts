import type { AgentConfig } from '@wingman/schema'
import { describe, expect, it, vi } from 'vitest'

import { createToolMiddleware } from './adapters.js'
import { Wingman } from './index.js'

const config: AgentConfig = {
  systemPrompt: 'Help.',
  tools: { export_records: { description: 'Export.' } },
  retrieval: {},
  rules: [],
}

describe('createToolMiddleware', () => {
  it('maps LangChain, Vercel AI, and OpenAI Agents shapes onto reviewToolCall', async () => {
    const reviewer = vi.fn(async (request) => {
      expect(request.proposedCall).toEqual({
        name: 'export_records',
        args: { filters: { stage: 'Negotiation' } },
      })
      return {
        action: 'ALLOW' as const,
        reason: 'The call matches the request.',
        instruction: null,
        confidence: 1,
      }
    })
    const wingman = Wingman.init({
      endpoint: 'https://wingman.test',
      apiKey: 'key',
      orgId: '5e8e68e1-a768-4342-b4f4-d9a1f8ceaa26',
      orgSalt: 'salt',
      signingKey: 'signing-key',
      baseConfig: config,
      defaultAgent: '4ee0d899-d63d-4bc2-b47a-25aa25c6078b',
      writable: ['rules'],
      redact: { fields: ['turns'] },
      review: { reviewer },
    })
    const middleware = createToolMiddleware(wingman)
    const base = {
      sessionId: 'f561f9b9-2abf-4bb7-a5cd-3b6ad76002b6',
      userId: 'user-1',
      userMessage: 'Export the filtered view.',
      recentTurns: [],
      context: {},
    }
    await expect(
      middleware.beforeLangChainTool({
        ...base,
        toolName: 'export_records',
        toolInput: { filters: { stage: 'Negotiation' } },
      }),
    ).resolves.toMatchObject({ action: 'ALLOW' })
    await expect(
      middleware.beforeVercelTool({
        ...base,
        toolName: 'export_records',
        args: { filters: { stage: 'Negotiation' } },
      }),
    ).resolves.toMatchObject({ action: 'ALLOW' })
    await expect(
      middleware.beforeOpenAIAgentTool({
        ...base,
        toolName: 'export_records',
        arguments: '{"filters":{"stage":"Negotiation"}}',
      }),
    ).resolves.toMatchObject({ action: 'ALLOW' })
    expect(reviewer).toHaveBeenCalledTimes(3)
  })

  it('normalizes string JSON, missing args, and non-JSON objects without executing', async () => {
    const seen: unknown[] = []
    const reviewer = vi.fn(async (request: { proposedCall: { args: unknown } }) => {
      seen.push(request.proposedCall.args)
      return {
        action: 'ALLOW' as const,
        reason: 'Normalized.',
        instruction: null,
        confidence: 1,
        source: 'LOCAL' as const,
      }
    })
    const middleware = createToolMiddleware({ reviewToolCall: reviewer })
    const base = {
      sessionId: 'f561f9b9-2abf-4bb7-a5cd-3b6ad76002b6',
      userId: 'user-1',
      userMessage: 'Export.',
      recentTurns: [],
      context: {},
    }
    await middleware.beforeLangChainTool({
      ...base,
      toolName: 'export_records',
      toolInput: undefined,
    })
    await middleware.beforeVercelTool({ ...base, toolName: 'export_records', args: 'not-json' })
    await middleware.beforeOpenAIAgentTool({
      ...base,
      toolName: 'export_records',
      arguments: { filters: [1, 2] },
    })
    await middleware.review({ ...base, proposedCall: { name: 'export_records' } })
    expect(seen).toEqual([{}, { value: 'not-json' }, { filters: [1, 2] }, {}])
  })
})
