import type { AgentConfig, ModelClient, ToolCallReviewRequest } from '@wingman/schema'
import { describe, expect, it, vi } from 'vitest'

import { reviewProposedToolCall } from './review.js'

const config: AgentConfig = {
  systemPrompt: 'Help with deliveries.',
  tools: {
    cancel_order: { description: 'Cancel an order.' },
    reschedule_delivery: { description: 'Move a delivery to another date.' },
  },
  retrieval: {},
  rules: [],
}

const request: ToolCallReviewRequest = {
  agentId: '4ee0d899-d63d-4bc2-b47a-25aa25c6078b',
  sessionId: 'f561f9b9-2abf-4bb7-a5cd-3b6ad76002b6',
  userHash: 'a'.repeat(32),
  userMessage: 'No, move the delivery; do not cancel it.',
  proposedCall: { name: 'cancel_order', args: { orderId: 'order-1' } },
  recentTurns: [],
  context: {},
}

describe('reviewProposedToolCall', () => {
  it("returns a model's schema-valid rethink decision", async () => {
    const model: ModelClient = {
      generate: vi.fn(async () => ({
        action: 'RETHINK',
        reason: 'The latest correction conflicts with cancellation.',
        instruction: 'Choose the capability that changes the delivery date.',
        confidence: 0.97,
      })),
    }
    await expect(reviewProposedToolCall({ model, config, request })).resolves.toMatchObject({
      action: 'RETHINK',
      source: 'REMOTE',
    })
  })

  it('escalates a tool absent from the declared config without calling the model', async () => {
    const model: ModelClient = { generate: vi.fn() }
    await expect(
      reviewProposedToolCall({
        model,
        config,
        request: { ...request, proposedCall: { name: 'delete_database', args: {} } },
      }),
    ).resolves.toMatchObject({ action: 'ESCALATE', source: 'POLICY' })
    expect(model.generate).not.toHaveBeenCalled()
  })

  it('fails closed when the host asks for it and the model is unavailable', async () => {
    const model: ModelClient = {
      generate: vi.fn(async () => {
        throw new Error('offline')
      }),
    }
    await expect(
      reviewProposedToolCall({ model, config, request, failMode: 'closed' }),
    ).resolves.toMatchObject({ action: 'ESCALATE', source: 'FAIL_CLOSED' })
  })

  it('fails open when analysis is unavailable or invalid', async () => {
    const model: ModelClient = {
      generate: vi.fn(async () => {
        throw new Error('offline')
      }),
    }
    await expect(reviewProposedToolCall({ model, config, request })).resolves.toMatchObject({
      action: 'ALLOW',
      source: 'FAIL_OPEN',
    })
  })

  it('contains a model adapter that throws synchronously', async () => {
    const model = {
      generate: () => {
        throw new Error('broken adapter')
      },
    } as unknown as ModelClient
    await expect(reviewProposedToolCall({ model, config, request })).resolves.toMatchObject({
      action: 'ALLOW',
      source: 'FAIL_OPEN',
    })
  })

  it('bounds a stalled model and rejects malformed decisions', async () => {
    const stalled: ModelClient = {
      generate: async () => new Promise(() => undefined),
    }
    const started = performance.now()
    await expect(
      reviewProposedToolCall({ model: stalled, config, request, timeoutMs: 10 }),
    ).resolves.toMatchObject({
      action: 'ALLOW',
      source: 'FAIL_OPEN',
    })
    expect(performance.now() - started).toBeLessThan(100)

    const malformed: ModelClient = {
      generate: async () => ({ action: 'RETHINK', reason: 'Missing guidance', confidence: 0.8 }),
    }
    await expect(
      reviewProposedToolCall({ model: malformed, config, request }),
    ).resolves.toMatchObject({
      action: 'ALLOW',
      source: 'FAIL_OPEN',
    })
  })
})
