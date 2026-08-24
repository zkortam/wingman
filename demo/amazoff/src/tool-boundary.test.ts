import { Wingman } from '@wingman/sdk'
import { describe, expect, it, vi } from 'vitest'

import { AMAZOFF_BASE_CONFIG } from './agent/config.js'
import { reviewProposedHostToolCall } from './tool-boundary.js'

const sessionId = 'f561f9b9-2abf-4bb7-a5cd-3b6ad76002b6'

const client = (action: 'ALLOW' | 'RETHINK' | 'ESCALATE', fetcher?: typeof fetch) =>
  Wingman.init({
    endpoint: 'https://wingman.example',
    apiKey: 'key',
    orgId: '5e8e68e1-a768-4342-b4f4-d9a1f8ceaa26',
    orgSalt: 'demo-org-salt',
    signingKey: 'signing-key',
    defaultAgent: '4ee0d899-d63d-4bc2-b47a-25aa25c6078b',
    baseConfig: AMAZOFF_BASE_CONFIG,
    writable: ['rules'],
    redact: { fields: ['turns'] },
    ...(fetcher ? { fetcher } : {}),
    review: {
      reviewer: async () => ({
        action,
        reason: action === 'ALLOW' ? 'Matches the request.' : 'The customer asked to reschedule.',
        instruction: action === 'ALLOW' ? null : 'Choose reschedule_delivery.',
        confidence: 0.95,
      }),
    },
  })

describe('reviewProposedHostToolCall', () => {
  it('executes only after ALLOW and keeps RETHINK and ESCALATE off the executor', async () => {
    const allow = await reviewProposedHostToolCall({
      wingman: client('ALLOW'),
      sessionId,
      userId: 'stevette',
      userMessage: 'Where is my order?',
      proposedCall: { name: 'track_package', args: { orderId: 'AMZ-4417' } },
    })
    expect(allow.shouldExecute).toBe(true)

    const rethink = await reviewProposedHostToolCall({
      wingman: client('RETHINK'),
      sessionId,
      userId: 'stevette',
      userMessage: 'Move my delivery to Friday. Do not cancel it.',
      proposedCall: { name: 'cancel_order', args: { orderId: 'AMZ-4417' } },
    })
    expect(rethink.shouldExecute).toBe(false)
    expect(rethink.decision.action).toBe('RETHINK')

    const escalate = await reviewProposedHostToolCall({
      wingman: client('ESCALATE'),
      sessionId,
      userId: 'stevette',
      userMessage: 'Refund a different customer.',
      proposedCall: { name: 'issue_refund', args: { orderId: 'OTHER' } },
    })
    expect(escalate.shouldExecute).toBe(false)
    expect(escalate.decision.action).toBe('ESCALATE')
  })

  it('fails open so an unavailable sidecar does not take down Amazoff', async () => {
    const wingman = Wingman.init({
      endpoint: 'https://wingman.example',
      apiKey: 'key',
      orgId: '5e8e68e1-a768-4342-b4f4-d9a1f8ceaa26',
      orgSalt: 'demo-org-salt',
      signingKey: 'signing-key',
      defaultAgent: '4ee0d899-d63d-4bc2-b47a-25aa25c6078b',
      baseConfig: AMAZOFF_BASE_CONFIG,
      writable: ['rules'],
      redact: { fields: ['turns'] },
      fetcher: vi.fn(async () => {
        throw new Error('offline')
      }),
    })
    const decision = await reviewProposedHostToolCall({
      wingman,
      sessionId,
      userId: 'stevette',
      userMessage: 'Track my order',
      proposedCall: { name: 'track_package' },
    })
    expect(decision).toMatchObject({
      shouldExecute: true,
      decision: { action: 'ALLOW', source: 'FAIL_OPEN' },
    })
  })
})
