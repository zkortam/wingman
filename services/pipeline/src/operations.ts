import type { PipelineRepository } from './repository.js'
import { PIPELINE_POLICY } from './policy.js'

const DAY_MS = 24 * 60 * 60 * 1_000

export async function runExpirySweep(
  repository: PipelineRepository,
  now = new Date(),
): Promise<number> {
  return repository.expireIncidents(now)
}

export async function runRetentionSweep(
  repository: PipelineRepository,
  now = new Date(),
): Promise<number> {
  return repository.retainEvents(new Date(now.getTime() - PIPELINE_POLICY.retentionDays * DAY_MS))
}
