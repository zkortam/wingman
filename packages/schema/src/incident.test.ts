import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { RunResultSchema, RunSchema } from './incident.js'

describe('RunSchema', () => {
  it('rejects a run that reports tool execution', () => {
    const result = {
      passed: true,
      toolCalls: [{ name: 'export_records', args: {} }],
      text: null,
      cassetteKey: 'host:0',
    }
    expect(RunResultSchema.parse(result)).toEqual(result)
    expect(
      RunSchema.safeParse({
        id: randomUUID(),
        assertionId: randomUUID(),
        incidentId: randomUUID(),
        phase: 'VERIFY_FAIL',
        attempt: 1,
        configVersionId: randomUUID(),
        candidateId: null,
        n: 5,
        passCount: 0,
        results: [result],
        toolExecutions: 1,
        createdAt: '2026-08-23T20:00:00.000Z',
      }).success,
    ).toBe(false)
    expect(
      RunSchema.parse({
        id: randomUUID(),
        assertionId: randomUUID(),
        incidentId: null,
        phase: 'POSITIVE_SUITE',
        attempt: 1,
        configVersionId: null,
        candidateId: null,
        n: 1,
        passCount: 1,
        results: [result],
        toolExecutions: 0,
        createdAt: '2026-08-23T20:00:00.000Z',
      }).toolExecutions,
    ).toBe(0)
  })
})
