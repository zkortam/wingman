import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import SettingsPage from './page'

describe('production settings', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('reports integration readiness without rendering credential values or demo identity', () => {
    vi.stubEnv('WINGMAN_RUNTIME', 'production')
    vi.stubEnv('WINGMAN_API_KEY', 'sdk-super-secret')
    vi.stubEnv('DATABASE_URL', 'postgres://wingman:wingman@localhost:5432/wingman')

    const { container } = render(<SettingsPage />)

    expect(screen.getByText('SDK authentication')).toBeTruthy()
    expect(screen.getAllByText('Configured').length).toBeGreaterThan(0)
    expect(container.textContent).not.toContain('sdk-super-secret')
    expect(container.textContent).not.toContain('database-super-secret')
    expect(container.textContent).not.toContain('Ops Copilot')
    expect(container.textContent).not.toContain('out_live_')
  })
})
