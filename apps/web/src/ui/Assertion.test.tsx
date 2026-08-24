import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Assertion } from './Assertion'

describe('Assertion', () => {
  it('renders an invariant rather than output text', () => {
    render(
      <Assertion
        assertion={{
          kind: 'TOOL_CALLED',
          expression: 'export_records',
          params: { tool: 'export_records' },
        }}
      />,
    )
    expect(screen.getByText(/TOOL_CALLED/)).toBeTruthy()
    expect(screen.getByText(/"tool": "export_records"/)).toBeTruthy()
  })
})
