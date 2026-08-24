import { randomUUID } from 'node:crypto'

import { AMAZOFF_BASE_CONFIG, AmazoffAgent, OrderBook, type Order } from '@demo/amazoff'
import {
  classifyTurn,
  detectLiveSignals,
  formExpectation,
  repairForExpectation,
} from '@wingman/pipeline'
import { SignalKindSchema, type AgentConfig, type ModelClient, type SignalKind, type Turn } from '@wingman/schema'
import { describe, expect, it } from 'vitest'

/**
 * The demo, end to end, with nothing stubbed between Amazoff and Wingman except the
 * language model. Stevette asks to reschedule, the agent cancels, she pushes back, and
 * Wingman repairs the config in time for the retry to succeed in the same conversation.
 *
 * This exists to stop the demo from being theatre. Every claim it makes on stage is
 * asserted here against the real agent and the real live path.
 */
const TODAY = '2026-08-23'
const SESSION_ID = randomUUID()
const AGENT_ID = randomUUID()

const SEED: Order = {
  id: 'AMZ-4417',
  customerId: 'stevette',
  summary: 'Running shoes, size 8',
  deliveryDate: '2026-08-26',
  status: 'IN_TRANSIT',
  statusBeforeCancel: null,
}

/** Stands in for the model that predicts what the agent ought to do. */
const expectationModel: ModelClient = {
  generate: (request) => {
    const asked = JSON.stringify((request as { messages: unknown[] }).messages)
    const wantsDeliveryChange = /reschedul|move|change .*deliver|push .*deliver/i.test(asked)
    return Promise.resolve(
      wantsDeliveryChange
        ? { definition: { kind: 'TOOL_CALLED', tool: 'reschedule_delivery' }, confidence: 0.9 }
        : { definition: null, confidence: 0 },
    )
  },
}

const turn = (idx: number, role: Turn['role'], text: string | null) => ({
  idx,
  role,
  textRedacted: text,
  toolCalls: [],
  createdAt: `${TODAY}T00:0${String(idx)}:00.000Z`,
  embedding: null,
})

/**
 * A fresh agent has seen nothing, so every signal starts from a zero baseline. Built
 * from the enum rather than written out, so adding a signal kind cannot leave a hole
 * here: a missing baseline makes the confidence NaN and silently drops the signal.
 */
const baselines = Object.fromEntries(
  SignalKindSchema.options.map((kind) => [kind, 0]),
) as Record<SignalKind, number>

const session = (turns: ReturnType<typeof turn>[]) => ({
  id: SESSION_ID,
  orgId: randomUUID(),
  agentId: AGENT_ID,
  userHash: 'a'.repeat(32),
  taskFingerprint: null,
  startedAt: `${TODAY}T00:00:00.000Z`,
  turns,
})

describe('Stevette asks to reschedule and the agent cancels', () => {
  it('recovers inside the session and leaves the order intact', async () => {
    const orders = new OrderBook([SEED], () => `${TODAY}T00:00:00.000Z`)
    const agent = new AmazoffAgent(orders, () => TODAY)
    let config: AgentConfig = AMAZOFF_BASE_CONFIG

    // --- Turn 1: the request, and the misstep -------------------------------------
    const request = 'I need to reschedule my delivery to Friday'
    const expectation = await formExpectation(expectationModel, {
      sessionId: SESSION_ID,
      turnIdx: 0,
      utterance: request,
      config,
      now: () => `${TODAY}T00:00:00.000Z`,
    })
    expect(expectation?.definition).toEqual({ kind: 'TOOL_CALLED', tool: 'reschedule_delivery' })

    const first = agent.respond({ utterance: request, customerId: 'stevette', config })
    expect(first.toolCalls[0]?.name).toBe('cancel_order')
    expect(orders.get('AMZ-4417')?.status).toBe('CANCELLED')

    // Wingman is watching but says nothing yet. An unexpected route to a good answer is
    // normal, and the customer has not complained.
    const quiet = classifyTurn({
      agentId: AGENT_ID,
      signals: [],
      expectation,
      decision: { toolCalls: first.toolCalls, text: first.text },
      config,
      context: { session: {}, user: { rules: [] } },
      utterance: request,
    })
    expect(quiet.lane).toBe('NONE')

    // --- Turn 2: she pushes back ---------------------------------------------------
    const pushback = 'No, I said reschedule it, not cancel it'
    const signals = detectLiveSignals({
      session: session([
        turn(0, 'user', request),
        turn(1, 'assistant', first.text),
        turn(2, 'user', pushback),
      ]),
      baselines,
      matchingRestart: false,
    })
    expect(signals.map(({ kind }) => kind)).toContain('RETRY_REQUEST')

    const verdict = classifyTurn({
      agentId: AGENT_ID,
      signals,
      expectation,
      decision: { toolCalls: first.toolCalls, text: first.text },
      config,
      context: { session: {}, user: { rules: [] } },
      utterance: pushback,
    })
    expect(verdict).toMatchObject({ lane: 'FIX', repairable: true })

    // --- Wingman repairs the config ------------------------------------------------
    if (expectation === null) throw new Error('expected an expectation')
    const repaired = repairForExpectation(config, expectation)
    expect(repaired).not.toBeNull()
    if (repaired === null) throw new Error('expected a repair')
    config = repaired

    // --- Turn 3: the retry, against the repaired config -----------------------------
    const retry = agent.respond({ utterance: request, customerId: 'stevette', config })
    expect(retry.toolCalls[0]).toEqual({
      name: 'reschedule_delivery',
      args: { orderId: 'AMZ-4417', deliveryDate: '2026-08-28' },
    })

    // The damage is undone and the thing she actually wanted has happened.
    expect(orders.get('AMZ-4417')).toMatchObject({
      status: 'IN_TRANSIT',
      deliveryDate: '2026-08-28',
      statusBeforeCancel: null,
    })
    expect(retry.text).toContain('reinstated')

    // And the trail explains itself, which is what Steve sees.
    expect(orders.events().map(({ action }) => action)).toEqual([
      'cancel_order',
      'reschedule_delivery',
    ])
  })
})
