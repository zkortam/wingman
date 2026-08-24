import { describe, expect, it, vi } from 'vitest'

import type { PipelineCommands } from '@wingman/schema'

import type { PipelineEngine } from '../engine.js'
import type { PipelineRepository } from '../repository.js'
import { createPipelineFunctions } from './index.js'

describe('createPipelineFunctions', () => {
  it('routes Inngest events onto engine, confirmation, and sweep ports', async () => {
    const observeSession = vi.fn(async () => ({ incidentId: 'i1', state: 'CLUSTERED' }))
    const resumeIncident = vi.fn(async () => ({ incidentId: 'i1', state: 'ASSERTED' }))
    const evaluateConfirmation = vi.fn(async () => 'CONFIRMED' as const)
    const expireIncidents = vi.fn(async () => 2)
    const retainEvents = vi.fn(async () => 3)
    const functions = createPipelineFunctions({
      engine: { observeSession, resumeIncident } as unknown as PipelineEngine,
      commands: { evaluateConfirmation } as unknown as PipelineCommands,
      repository: { expireIncidents, retainEvents } as unknown as PipelineRepository,
      now: () => new Date('2026-08-23T00:00:00.000Z'),
    })

    await functions.onSessionObserved({ data: { sessionId: 's1' } })
    await functions.onIncidentClustered({ data: { incidentId: 'i1' } })
    await functions.onConfirmationDue({ data: { incidentId: 'i1' } })
    await expect(functions.expirySweep()).resolves.toBe(2)
    await expect(functions.retentionSweep()).resolves.toBe(3)

    expect(observeSession).toHaveBeenCalledWith('s1')
    expect(resumeIncident).toHaveBeenCalledWith('i1')
    expect(evaluateConfirmation).toHaveBeenCalledWith('i1')
    expect(expireIncidents).toHaveBeenCalledWith(new Date('2026-08-23T00:00:00.000Z'))
  })
})
