import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Dots } from './Dots'

describe('Dots', () => {
  it('uses shape, color, and count text to communicate results', () => {
    render(<Dots n={5} passCount={2} />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('2 of 5 runs passed')
    expect(screen.getByText('2/5 passed')).toBeTruthy()
    expect(screen.getByRole('img').querySelectorAll('circle')).toHaveLength(5)
  })
})
