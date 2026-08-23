import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { KeyHint } from './KeyHint'

describe('KeyHint', () => {
  it('uses semantic keyboard markup', () => {
    render(<KeyHint keys={['j', 'k']} />)
    expect(screen.getAllByText(/j|k/).every((node) => node.tagName === 'KBD')).toBe(true)
  })
})
