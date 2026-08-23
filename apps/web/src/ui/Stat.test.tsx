import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Stat } from './Stat'

describe('Stat', () => {
  it('treats a falling failure rate as improvement', () => {
    render(<Stat delta="0.3" direction="down" label="Silent failure rate" value="4.2%" />)
    expect(screen.getByText(/Down 0.3/).getAttribute('data-direction')).toBe('down')
  })
})
