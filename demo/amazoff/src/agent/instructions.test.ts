import { describe, expect, it } from 'vitest'

import { parseInstructions } from './instructions.js'

describe('parseInstructions', () => {
  it('reads the notes a customer actually types', () => {
    expect(parseInstructions("Please leave it at the door and don't ring the bell")).toBe(
      'leave at the door; do not ring the bell',
    )
    expect(parseInstructions('leave with a neighbor')).toBe('leave with a neighbor')
  })

  it('falls back to the utterance when nothing familiar was said', () => {
    expect(parseInstructions('please use the side gate')).toBe('use the side gate')
  })
})
