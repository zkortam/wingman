import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AppFrame } from './AppFrame'

let pathname = '/demo'
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn() }),
}))

describe('AppFrame', () => {
  it('keeps the demo harness free of application chrome', () => {
    pathname = '/demo'
    render(
      <AppFrame>
        <div>demo</div>
      </AppFrame>,
    )
    expect(screen.queryByText('Wingman')).toBeNull()
  })

  it('provides navigation for product screens', () => {
    pathname = '/inbox'
    render(
      <AppFrame>
        <div>inbox</div>
      </AppFrame>,
    )
    expect(screen.getByText('Wingman')).toBeTruthy()
  })
})
