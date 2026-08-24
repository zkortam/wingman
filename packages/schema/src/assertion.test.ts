import { describe, expect, it } from 'vitest'

import { assertionEqual, evaluateAssertion, isDecidableAtToolBoundary } from './assertion.js'

describe('assertions', () => {
  it('compares primitive arrays without order sensitivity', () => {
    expect(assertionEqual(['b', 'a', 3], [3, 'a', 'b'])).toBe(true)
  })

  it('resolves capped context references at the tool boundary', () => {
    expect(
      evaluateAssertion(
        {
          kind: 'TOOL_ARG_EQUALS',
          tool: 'export_records',
          arg: 'filters',
          expected: { $ref: 'session.viewFilters' },
        },
        {
          toolCalls: [
            {
              id: '1',
              name: 'export_records',
              args: { filters: { status: 'New' } },
            },
          ],
          text: null,
        },
        { session: { viewFilters: { status: 'New' } }, user: { rules: [] } },
      ),
    ).toBe(true)
  })

  it('keeps OUTPUT_MATCHES_RULE compatible but non-executable', () => {
    expect(
      isDecidableAtToolBoundary({
        kind: 'OUTPUT_MATCHES_RULE',
        rule: 'be concise',
      }),
    ).toBe(false)
  })
})
