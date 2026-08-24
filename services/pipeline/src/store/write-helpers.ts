import { canonicalJSON, StageError } from '@wingman/schema'

import type { IncidentRecord } from '../domain.js'

export function assertSamePayload(stage: string, existing: unknown, next: unknown): void {
  if (canonicalJSON(existing) !== canonicalJSON(next)) {
    throw new StageError(stage, 'STALE_IDEMPOTENT_ROW', false)
  }
}

export function unique(values: string[]): string[] {
  return [...new Set(values)]
}

export function uniqueEvidence(
  values: IncidentRecord['evidenceExcerpts'],
): IncidentRecord['evidenceExcerpts'] {
  return [
    ...new Map(
      values.map((value) => [`${value.sessionId}:${value.turnIdx}:${value.kind}`, value]),
    ).values(),
  ]
}
