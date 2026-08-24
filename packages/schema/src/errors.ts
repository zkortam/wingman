import { z } from 'zod'

export const ParkReasonSchema = z.enum([
  'LLM_UNAVAILABLE',
  'SCHEMA_INVALID',
  'DIFF_TOO_LARGE',
  'PATH_NOT_WRITABLE',
  'ITERATIONS_EXHAUSTED',
  'SUITE_REGRESSED',
  'NOT_ISOLATABLE',
  'POLICY_CONFLICT',
  'CAP_EXCEEDED',
  'STALE_IDEMPOTENT_ROW',
])
export type ParkReason = z.infer<typeof ParkReasonSchema>

export class StageError extends Error {
  constructor(
    readonly stage: string,
    readonly reason: ParkReason,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(`${stage}: ${reason}`, options)
    this.name = 'StageError'
  }
}

export class PathNotWritableError extends Error {
  readonly reason = 'PATH_NOT_WRITABLE' as const

  constructor() {
    super('Config diff contains a path outside the writable allowlist')
    this.name = 'PathNotWritableError'
  }
}

export class DiffTooLargeError extends Error {
  readonly reason = 'DIFF_TOO_LARGE' as const

  constructor() {
    super('Config diff exceeds the configured byte limit')
    this.name = 'DiffTooLargeError'
  }
}
