import { SignalKindSchema, type SignalKind } from '@wingman/schema'

import type { IncidentRecord } from '../domain.js'
import type { ReplayDatabase } from './database.js'

export function required<T>(map: Map<string, T>, id: string, name: string): T {
  const value = map.get(id)
  if (value === undefined) throw new Error(`${name} not found: ${id}`)
  return value
}

export function rates(sessionIds: string[], signals: ReplayDatabase['signals']) {
  const ids = new Set(sessionIds)
  // Derived from the enum, not hand-listed.
  const kinds: readonly SignalKind[] = SignalKindSchema.options
  return Object.fromEntries(
    kinds.map((kind) => [
      kind,
      sessionIds.length === 0
        ? 0
        : new Set(
            signals
              .filter((signal) => ids.has(signal.sessionId) && signal.kind === kind)
              .map(({ sessionId }) => sessionId),
          ).size / sessionIds.length,
    ]),
  ) as Record<SignalKind, number>
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

export function defined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Partial<T>
}
