import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { CopyId } from './CopyId'

describe('CopyId', () => {
  it('copies the complete identifier', async () => {
    render(<CopyId id="OC-1042" />)
    await userEvent.click(screen.getByRole('button'))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('OC-1042')
  })
})
