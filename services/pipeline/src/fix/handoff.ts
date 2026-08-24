import { HandoffPayloadSchema, type Assertion } from '@wingman/schema'

import type { IncidentRecord } from '../domain.js'
import type { PipelineRepository } from '../repository.js'
import type { AppServerClient } from './app-server.js'

export async function handoffCodeDefect(input: {
  repository: PipelineRepository
  appServer: AppServerClient
  incident: IncidentRecord
  assertion: Assertion
  before: Awaited<ReturnType<PipelineRepository['saveRun']>>
}): Promise<void> {
  const payload = HandoffPayloadSchema.parse({
    task: `Investigate code defect: ${input.incident.title}`,
    context: {
      failingAssertion: input.assertion.definition,
      failingRuns: input.before.results,
      affectedUsers: input.incident.userHashes,
      sessions: input.incident.sessionIds,
      priorAttempts: [],
    },
    constraints: { maxIterations: 5, requireTestPass: true },
  })
  const remote = await input.appServer.handoff(payload)
  await input.repository.saveHandoff({
    incidentId: input.incident.id,
    payload,
    remoteThreadId: remote.threadId,
  })
}
