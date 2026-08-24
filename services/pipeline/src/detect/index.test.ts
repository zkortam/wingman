import { describe, expect, it } from 'vitest'

import type { ObservedSession } from '../domain.js'
import { detectLiveSignals, detectSignals, type Baselines } from './index.js'

const NO_BASELINE: Baselines = {
  RETRY_REQUEST: 0,
  RESTATED_CONSTRAINT: 0,
  ABANDON_RESTART: 0,
  PREFERENCE_STATED: 0,
}

const withFinalTurn = (text: string): ObservedSession => ({
  ...session,
  turns: [
    ...session.turns.slice(0, -1),
    { ...session.turns[2], idx: 2, textRedacted: text },
  ] as ObservedSession['turns'],
})

const session: ObservedSession = {
  id: '00000000-0000-4000-8000-000000000001',
  orgId: '00000000-0000-4000-8000-000000000002',
  agentId: '00000000-0000-4000-8000-000000000003',
  userHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  taskFingerprint: 'task',
  startedAt: '2026-01-01T00:00:00.000Z',
  turns: [
    {
      idx: 0,
      role: 'user',
      textRedacted: 'Export active filtered records',
      toolCalls: [],
      embedding: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      idx: 1,
      role: 'assistant',
      textRedacted: null,
      toolCalls: [],
      embedding: null,
      createdAt: '2026-01-01T00:00:01.000Z',
    },
    {
      idx: 2,
      role: 'user',
      textRedacted: 'Try again: export active filtered records',
      toolCalls: [],
      embedding: null,
      createdAt: '2026-01-01T00:00:02.000Z',
    },
  ],
}

describe('detectSignals', () => {
  it('detects only the final user turn and requires a conjunction', () => {
    const signals = detectSignals({
      session,
      baselines: {
        RETRY_REQUEST: 0,
        RESTATED_CONSTRAINT: 0,
        ABANDON_RESTART: 0,
        PREFERENCE_STATED: 0,
      },
      matchingRestart: false,
    })
    expect(signals.map(({ kind }) => kind)).toEqual(['RETRY_REQUEST', 'RESTATED_CONSTRAINT'])
    expect(signals.every(({ turnIdx }) => turnIdx === 2)).toBe(true)
  })

  it('suppresses common behavior through the baseline', () => {
    expect(
      detectSignals({
        session,
        baselines: {
          RETRY_REQUEST: 0.6,
          RESTATED_CONSTRAINT: 0.6,
          ABANDON_RESTART: 0,
          PREFERENCE_STATED: 0,
        },
        matchingRestart: false,
      }),
    ).toEqual([])
  })

  it('uses a prior cancelled matching session for restart', () => {
    const signals = detectSignals({
      session,
      baselines: {
        RETRY_REQUEST: 0,
        RESTATED_CONSTRAINT: 0,
        ABANDON_RESTART: 0,
        PREFERENCE_STATED: 0,
      },
      matchingRestart: true,
    })
    expect(signals.some(({ kind }) => kind === 'ABANDON_RESTART')).toBe(true)
  })
})

describe('detectLiveSignals', () => {
  // The reason the two functions exist.
  it('keeps a lone preference the batch path discards', () => {
    const preferenceOnly = withFinalTurn('Just do it, stop asking me to confirm every step.')
    expect(
      detectSignals({
        session: preferenceOnly,
        baselines: NO_BASELINE,
        matchingRestart: false,
      }),
    ).toEqual([])
    expect(
      detectLiveSignals({
        session: preferenceOnly,
        baselines: NO_BASELINE,
        matchingRestart: false,
      }).map(({ kind }) => kind),
    ).toEqual(['PREFERENCE_STATED'])
  })

  it('still applies the baseline and the confidence floor', () => {
    expect(
      detectLiveSignals({
        session,
        baselines: { ...NO_BASELINE, RETRY_REQUEST: 0.6, RESTATED_CONSTRAINT: 0.6 },
        matchingRestart: false,
      }),
    ).toEqual([])
  })

  it('reports a lone correction so the classifier can pair it with the expectation', () => {
    expect(
      detectLiveSignals({
        session: withFinalTurn('No, I said return, not cancel.'),
        baselines: NO_BASELINE,
        matchingRestart: false,
      }).map(({ kind }) => kind),
    ).toEqual(['RETRY_REQUEST'])
  })
})
