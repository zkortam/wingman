/** Wingman contains its own failures so it can never take down the host agent. */
export type DiagnosticStage = 'review' | 'config' | 'observe' | 'storage' | 'replay'

export interface DiagnosticEvent {
  stage: DiagnosticStage
  /** Stable, machine-matchable identifier for the failure. */
  code: DiagnosticCode
  message: string
  cause?: unknown
  detail?: Record<string, unknown>
}

export type DiagnosticCode =
  /** The request was rejected as malformed before it was sent. Host bug. */
  | 'INVALID_INPUT'
  /** Credentials were rejected. Wingman is not reviewing anything. */
  | 'UNAUTHORIZED'
  /** The service answered with a server error or was unreachable. */
  | 'UNAVAILABLE'
  /** The deadline expired before an answer arrived. */
  | 'TIMEOUT'
  /** The service answered, but the answer did not match the contract. */
  | 'INVALID_RESPONSE'
  /** A signed configuration failed verification and was discarded. */
  | 'CONFIG_REJECTED'
  /** Configuration was served from a fallback rather than the control plane. */
  | 'CONFIG_FALLBACK'
  /** Local last-known-good storage could not be read or written. */
  | 'STORAGE_UNAVAILABLE'
  /** Evidence was discarded because the queue was full or delivery failed. */
  | 'EVIDENCE_DROPPED'

export type DiagnosticListener = (event: DiagnosticEvent) => void

/** Reports an event without ever letting a faulty listener reach the caller. */
export const report = (listener: DiagnosticListener | undefined, event: DiagnosticEvent): void => {
  if (listener === undefined) return
  try {
    listener(event)
  } catch {
    // A host's logger must never be able to fail a review or an observation.
  }
}

/** Classifies a transport failure so a host can tell misconfiguration from an outage. */
export const classifyStatus = (status: number): DiagnosticCode => {
  if (status === 401 || status === 403) return 'UNAUTHORIZED'
  if (status === 408 || status === 504) return 'TIMEOUT'
  return 'UNAVAILABLE'
}
