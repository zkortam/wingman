import type { AgentConfig } from '@wingman/schema'
import { describe, expect, it, vi } from 'vitest'

import { createToolMiddleware } from './adapters.js'
import { Wingman, createAgentReplayHandler, isMcpToolsCallRequest } from './index.js'
import * as publicApi from './index.js'

const agentId = '4ee0d899-d63d-4bc2-b47a-25aa25c6078b'
const sessionId = 'f561f9b9-2abf-4bb7-a5cd-3b6ad76002b6'
const baseConfig: AgentConfig = {
  systemPrompt: 'You are a careful operations assistant.',
  tools: {
    export_records: { description: 'Export records using the caller filters.' },
    cancel_order: { description: 'Cancel an order.' },
  },
  retrieval: {},
  rules: [],
}

const init = (fetcher: typeof fetch, extras: { failMode?: 'open' | 'closed' } = {}) =>
  Wingman.init({
    endpoint: 'https://wingman.example',
    apiKey: 'host-api-key',
    orgId: '5e8e68e1-a768-4342-b4f4-d9a1f8ceaa26',
    orgSalt: 'org-salt',
    signingKey: 'signing-key',
    defaultAgent: agentId,
    baseConfig,
    writable: ['rules', 'tools.*.description'],
    redact: { fields: ['turns', 'lastQuery'] },
    fetcher,
    ...(extras.failMode ? { review: { failMode: extras.failMode } } : {}),
  })

const proposed = {
  sessionId,
  userId: 'reporter@example.com',
  userMessage: 'Export the Negotiation-stage view.',
  proposedCall: { name: 'export_records', args: { filters: { stage: 'Negotiation' } } },
  recentTurns: [] as {
    idx: number
    role: 'user'
    textRedacted: string | null
    toolCalls: []
    createdAt: string
  }[],
  context: { lastQuery: 'stage = Negotiation' },
}

describe('host SDK contract', () => {
  it('lets a host review, observe, resolve config, and flush without throwing', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/v1/reviews/tool-calls')) {
        const body = JSON.parse(String(init?.body)) as {
          userHash: string
          proposedCall: { name: string }
        }
        expect(body.userHash).toMatch(/^[a-f0-9]{32}$/)
        expect(body.proposedCall.name).toBe('export_records')
        expect(JSON.stringify(body)).not.toContain('reporter@example.com')
        return Response.json({
          action: 'ALLOW',
          reason: 'The call matches the visible filters.',
          instruction: null,
          confidence: 0.94,
          source: 'REMOTE',
        })
      }
      if (url.includes('/v1/config/')) return new Response('', { status: 503 })
      if (url.endsWith('/v1/events')) return new Response('', { status: 202 })
      throw new Error(`unexpected ${url}`)
    })
    const wingman = init(fetcher)

    await expect(wingman.reviewToolCall(proposed)).resolves.toMatchObject({
      action: 'ALLOW',
      source: 'REMOTE',
    })
    await expect(
      wingman.config({ agent: agentId, userId: 'reporter@example.com' }),
    ).resolves.toEqual(baseConfig)
    await expect(wingman.rules('reporter@example.com')).resolves.toEqual([])

    wingman.observe({
      id: sessionId,
      userId: 'reporter@example.com',
      startedAt: '2026-08-23T20:00:00.000Z',
      lastQuery: 'stage = Negotiation',
      turns: [
        {
          idx: 0,
          role: 'user',
          text: 'Export the Negotiation-stage view.',
          toolCalls: [],
          createdAt: '2026-08-23T20:00:00.000Z',
        },
      ],
    })
    await wingman.flush()
    expect(wingman.observationStats()).toMatchObject({ queued: 0, sent: 1, failed: 0 })
  })

  it('maps MCP, LangChain, Vercel AI, and OpenAI Agents calls onto the same decision', async () => {
    const reviewer = vi.fn(async (request: { proposedCall: { name: string; args: unknown } }) => {
      expect(request.proposedCall).toEqual({
        name: 'export_records',
        args: { filters: { stage: 'Negotiation' } },
      })
      return {
        action: 'RETHINK' as const,
        reason: 'The current view is not an unfiltered export.',
        instruction: 'Pass the active view filters.',
        confidence: 0.9,
      }
    })
    const wingman = Wingman.init({
      endpoint: 'https://wingman.example',
      apiKey: 'host-api-key',
      orgId: '5e8e68e1-a768-4342-b4f4-d9a1f8ceaa26',
      orgSalt: 'org-salt',
      signingKey: 'signing-key',
      defaultAgent: agentId,
      baseConfig,
      writable: ['rules'],
      redact: { fields: ['turns'] },
      review: { reviewer },
    })
    const base = {
      sessionId,
      userId: 'user-1',
      userMessage: 'Export the filtered view.',
      recentTurns: [],
      context: {},
    }
    const middleware = createToolMiddleware(wingman)
    const mcp = {
      jsonrpc: '2.0' as const,
      id: 1,
      method: 'tools/call' as const,
      params: { name: 'export_records', arguments: { filters: { stage: 'Negotiation' } } },
    }
    expect(isMcpToolsCallRequest(mcp)).toBe(true)
    await expect(wingman.reviewMcpToolCall({ ...base, request: mcp })).resolves.toMatchObject({
      action: 'RETHINK',
    })
    await expect(
      middleware.beforeLangChainTool({
        ...base,
        toolName: 'export_records',
        toolInput: { filters: { stage: 'Negotiation' } },
      }),
    ).resolves.toMatchObject({ action: 'RETHINK' })
    await expect(
      middleware.beforeVercelTool({
        ...base,
        toolName: 'export_records',
        args: { filters: { stage: 'Negotiation' } },
      }),
    ).resolves.toMatchObject({ action: 'RETHINK' })
    await expect(
      middleware.beforeOpenAIAgentTool({
        ...base,
        toolName: 'export_records',
        arguments: '{"filters":{"stage":"Negotiation"}}',
      }),
    ).resolves.toMatchObject({ action: 'RETHINK' })
  })

  it('keeps the Outcome alias and a model-only replay handler for existing hosts', async () => {
    expect(Reflect.get(publicApi, 'Outcome')).toBe(Wingman)
    const handler = createAgentReplayHandler({
      token: 'runner-token',
      run: async () => ({ toolCalls: [], text: 'no tools', cassetteKey: 'host:0' }),
    })
    const ok = await handler(
      new Request('https://host/replay', {
        method: 'POST',
        headers: { authorization: 'Bearer runner-token' },
        body: JSON.stringify({
          config: baseConfig,
          messages: [],
          interceptToolCalls: true,
        }),
      }),
    )
    expect(ok.status).toBe(200)
    expect(await ok.json()).toMatchObject({ toolExecutions: 0 })
  })

  it('fails closed for a host that opted out of fail-open', async () => {
    const wingman = init(
      vi.fn(async () => new Response('', { status: 503 })),
      { failMode: 'closed' },
    )
    await expect(wingman.reviewToolCall(proposed)).resolves.toMatchObject({
      action: 'ESCALATE',
      source: 'FAIL_CLOSED',
    })
  })
})
