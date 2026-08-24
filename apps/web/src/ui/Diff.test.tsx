import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Diff } from './Diff'

describe('Diff', () => {
  it('renders additions and removals with explicit gutter symbols', () => {
    render(<Diff path="rules" lines={[{ kind: 'remove', text: 'old' }, { kind: 'add', text: 'new' }]} />)
    expect(screen.getByText('-')).toBeTruthy()
    expect(screen.getByText('+')).toBeTruthy()
  })
})
