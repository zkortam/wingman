import { describe, expect, it } from 'vitest'

import { DiffTooLargeError, PathNotWritableError, StageError } from './errors.js'

describe('pipeline errors', () => {
  it('carries a park reason without becoming a retry loop signal', () => {
    const error = new StageError('verify-fail', 'LLM_UNAVAILABLE', true)
    expect(error.stage).toBe('verify-fail')
    expect(error.reason).toBe('LLM_UNAVAILABLE')
    expect(error.retryable).toBe(true)
    expect(error.name).toBe('StageError')
  })

  it('names writable-path and diff-cap failures for apply', () => {
    expect(new PathNotWritableError().reason).toBe('PATH_NOT_WRITABLE')
    expect(new DiffTooLargeError().reason).toBe('DIFF_TOO_LARGE')
  })
})
