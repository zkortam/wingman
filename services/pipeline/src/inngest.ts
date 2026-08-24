import { Inngest } from 'inngest'
import { z } from 'zod'

import { createProductionPipelineFunctions } from './production.js'

const IdEventSchema = z.object({ data: z.object({ sessionId: z.string().uuid() }) })
const IncidentEventSchema = z.object({ data: z.object({ incidentId: z.string().uuid() }) })

export const pipelineInngest = new Inngest({ id: 'wingman-pipeline' })

let runtime: ReturnType<typeof createProductionPipelineFunctions> | undefined
const functions = () => {
  runtime ??= createProductionPipelineFunctions()
  return runtime
}

const observed = pipelineInngest.createFunction(
  { id: 'process-observed-session', retries: 3, triggers: [{ event: 'session.observed' }] },
  async ({ event, step }) => {
    const parsed = IdEventSchema.parse(event)
    return step.run('run-evidence-pipeline', () => functions().onSessionObserved(parsed))
  },
)

const clustered = pipelineInngest.createFunction(
  { id: 'resume-clustered-incident', retries: 3, triggers: [{ event: 'incident.clustered' }] },
  async ({ event, step }) => {
    const parsed = IncidentEventSchema.parse(event)
    return step.run('resume-incident', () => functions().onIncidentClustered(parsed))
  },
)

const confirmation = pipelineInngest.createFunction(
  { id: 'evaluate-confirmation', retries: 3, triggers: [{ event: 'confirmation.due' }] },
  async ({ event, step }) => {
    const parsed = IncidentEventSchema.parse(event)
    return step.run('evaluate-confirmation', () => functions().onConfirmationDue(parsed))
  },
)

const expiry = pipelineInngest.createFunction(
  { id: 'expire-stale-incidents', retries: 3, triggers: [{ cron: '15 * * * *' }] },
  ({ step }) => step.run('expire-incidents', () => functions().expirySweep()),
)

const retention = pipelineInngest.createFunction(
  { id: 'retain-redacted-events', retries: 3, triggers: [{ cron: '30 3 * * *' }] },
  ({ step }) => step.run('delete-expired-events', () => functions().retentionSweep()),
)

export const pipelineInngestFunctions = [observed, clustered, confirmation, expiry, retention]
