import type { ConfigStore, Ledger, Outcome } from '@wingman/schema'

import type { AppServerClient } from './fix/app-server.js'
import type { ObservedSession } from './domain.js'
import type { PipelineRepository } from './repository.js'

export async function revertAppliedOutcome(input: {
  repository: PipelineRepository
  configStore: ConfigStore
  ledger: Ledger
  incidentId: string
}): Promise<Outcome> {
  const snapshot = await input.repository.getSnapshot(input.incidentId)
  if (snapshot.outcome === null) throw new Error('Incident has no applied outcome')
  if (!['APPLIED', 'CONFIRMED', 'REVERTED'].includes(snapshot.incident.state)) {
    throw new Error(`Cannot revert incident in ${snapshot.incident.state}`)
  }
  const targets = snapshot.outcome.scope === 'GLOBAL' ? [''] : snapshot.outcome.appliedTo
  for (const userHash of targets) {
    await input.configStore.revertOverride(snapshot.incident.agentId, userHash)
  }
  const alreadyReverted =
    snapshot.outcome.status === 'REVERTED' && snapshot.incident.state === 'REVERTED'
  const outcome =
    snapshot.outcome.status === 'REVERTED'
      ? snapshot.outcome
      : await input.repository.updateOutcome(snapshot.outcome.id, {
          status: 'REVERTED',
          revertedAt: new Date().toISOString(),
        })
  if (snapshot.incident.state !== 'REVERTED') {
    await input.repository.updateIncident(snapshot.incident.id, snapshot.incident.state, {
      state: 'REVERTED',
      stateReason: 'OPERATOR_REVERTED',
    })
  }
  if (!alreadyReverted) {
    await recordConfirmation(
      input.ledger,
      snapshot.incident.id,
      snapshot.incident.fingerprint,
      snapshot.candidate?.diff,
      'REVERTED',
    )
  }
  return outcome
}

export async function evaluateObservedConfirmation(input: {
  repository: PipelineRepository
  configStore: ConfigStore
  ledger: Ledger
  appServer: AppServerClient
  session: ObservedSession
  signalCount: number
}): Promise<Outcome | null> {
  const outcome = await input.repository.findPendingOutcome(input.session)
  if (outcome === null || outcome.status !== 'PENDING') return outcome
  const snapshot = await input.repository.getSnapshot(outcome.incidentId)
  if (input.signalCount > 0) {
    const targets = outcome.scope === 'GLOBAL' ? [''] : outcome.appliedTo
    for (const userHash of targets) {
      await input.configStore.revertOverride(snapshot.incident.agentId, userHash)
    }
    const updated = await input.repository.updateOutcome(outcome.id, {
      status: 'REFUTED',
      revertedAt: new Date().toISOString(),
    })
    await input.repository.updateIncident(snapshot.incident.id, 'APPLIED', {
      state: 'REVERTED',
      stateReason: 'SIGNAL_RECURRED',
    })
    await recordConfirmation(
      input.ledger,
      snapshot.incident.id,
      snapshot.incident.fingerprint,
      snapshot.candidate?.diff,
      'REFUTED',
    )
    return updated
  }

  const updated = await input.repository.updateOutcome(outcome.id, {
    status: 'CONFIRMED',
    confirmedAt: new Date().toISOString(),
  })
  await input.repository.updateIncident(snapshot.incident.id, 'APPLIED', {
    state: 'CONFIRMED',
  })
  // A confirmed fix becomes a regression test: the assertion that failed before the change and.
  if (snapshot.incident.assertionId !== null) {
    await input.repository.promoteAssertion(snapshot.incident.assertionId)
  }
  await recordConfirmation(
    input.ledger,
    snapshot.incident.id,
    snapshot.incident.fingerprint,
    snapshot.candidate?.diff,
    'CONFIRMED',
  )
  const threadId = snapshot.handoff?.remoteThreadId
  if (threadId !== undefined && threadId !== null) {
    await input.appServer.writeAgentsMd({
      threadId,
      content: `Confirmed outcome ${snapshot.incident.id}: ${snapshot.incident.title}`,
    })
  }
  return updated
}

export async function markUnobserved(input: {
  repository: PipelineRepository
  incidentId: string
  now: Date
}): Promise<'CONFIRMED' | 'REFUTED' | 'UNOBSERVED'> {
  const snapshot = await input.repository.getSnapshot(input.incidentId)
  if (snapshot.outcome === null) throw new Error('Incident has no outcome')
  if (snapshot.outcome.status !== 'PENDING') {
    return snapshot.outcome.status === 'REVERTED' ? 'REFUTED' : snapshot.outcome.status
  }
  if (new Date(snapshot.outcome.windowEndsAt) > input.now) {
    throw new Error('Confirmation window is still open')
  }
  await input.repository.updateOutcome(snapshot.outcome.id, {
    status: 'UNOBSERVED',
  })
  await input.repository.updateIncident(snapshot.incident.id, 'APPLIED', {
    state: 'CONFIRMED',
    stateReason: 'UNOBSERVED_RETAINED',
  })
  return 'UNOBSERVED'
}

async function recordConfirmation(
  ledger: Ledger,
  incidentId: string,
  fingerprint: string,
  diff: Awaited<ReturnType<PipelineRepository['getIncidentDiff']>> | undefined,
  status: string,
): Promise<void> {
  if (diff === undefined || diff === null) return
  await ledger.record({ incidentId, fingerprint, diff, outcome: status })
}
