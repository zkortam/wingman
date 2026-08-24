import type { SignalKind } from '@wingman/schema'

export interface SignalCandidate {
  kind: SignalKind
  rawConfidence: number
  confidence: number
  baseline: number
  evidence: Record<string, string | number | boolean>
}

export function requireConjunction(
  candidates: SignalCandidate[],
  minimumConfidence: number,
): SignalCandidate[] {
  const accepted = candidates.filter(({ confidence }) => confidence > minimumConfidence)
  return accepted.length >= 2 ? accepted : []
}
