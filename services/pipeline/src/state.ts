import type { IncidentState } from '@wingman/schema'

const ALLOWED_TRANSITIONS: Readonly<Record<IncidentState, readonly IncidentState[]>> = {
  OPEN: ['CLUSTERED', 'DISCARDED', 'HUMAN_REVIEW', 'PARKED', 'EXPIRED'],
  CLUSTERED: ['CLASSIFIED', 'DISCARDED', 'HUMAN_REVIEW', 'PARKED', 'EXPIRED'],
  CLASSIFIED: ['ASSERTED', 'DISCARDED', 'HUMAN_REVIEW', 'PARKED', 'EXPIRED'],
  ASSERTED: ['CANDIDATE', 'DISCARDED', 'HUMAN_REVIEW', 'PARKED', 'EXPIRED'],
  CANDIDATE: ['APPLIED', 'DISCARDED', 'PARKED', 'EXPIRED'],
  APPLIED: ['CONFIRMED', 'REVERTED'],
  CONFIRMED: ['REVERTED'],
  DISCARDED: ['CLUSTERED'],
  PARKED: ['CLUSTERED', 'DISCARDED'],
  REVERTED: ['CLUSTERED'],
  HUMAN_REVIEW: ['CLUSTERED', 'DISCARDED'],
  EXPIRED: ['CLUSTERED'],
}

export function assertTransition(from: IncidentState, to: IncidentState): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new Error(`Invalid incident transition: ${from} -> ${to}`)
  }
}

export function canTransition(from: IncidentState, to: IncidentState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to)
}

/** States the machine allows a transition to `to` from. Derived, so it cannot drift. */
export function statesTransitionableTo(to: IncidentState): IncidentState[] {
  return Object.entries(ALLOWED_TRANSITIONS)
    .filter(([, allowed]) => allowed.includes(to))
    .map(([from]) => from as IncidentState)
}
