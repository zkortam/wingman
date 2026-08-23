import { describe, expect, it } from 'vitest'

import { DEMO_AGENT, DEMO_CONTROL_HASH, DEMO_REPORTER_HASH } from '../domain/demo'
import { POST as apply } from '../../app/(api)/v1/incidents/[id]/apply/route'
import { POST as dismiss } from '../../app/(api)/v1/incidents/[id]/dismiss/route'
import { POST as handoff } from '../../app/(api)/v1/incidents/[id]/handoff/route'
import { POST as reopen } from '../../app/(api)/v1/incidents/[id]/reopen/route'
import { POST as revert } from '../../app/(api)/v1/config/[agent]/revert/route'
import { GET as resolveConfig } from '../../app/(read)/v1/config/[agent]/[userHash]/route'
import { demoRuntime } from './demo-runtime'

const params = <T extends Record<string, string>>(value: T): { params: Promise<T> } => ({ params: Promise.resolve(value) })

describe('Path B routes', () => {
  it('validates scope before an apply reaches the command port', async () => {
    const response = await apply(new Request('http://local/v1/incidents/OC-1042/apply', {
      method: 'POST',
      body: JSON.stringify({ scope: 'ORG' }),
    }), params({ id: 'OC-1042' }))
    expect(response.status).toBe(400)
    const malformed = await apply(new Request('http://local', { method: 'POST', body: '{' }), params({ id: 'OC-1042' }))
    expect(malformed.status).toBe(400)
  })

  it('requires an explicit dismissal reason', async () => {
    const response = await dismiss(new Request('http://local', { method: 'POST', body: '{}' }), params({ id: 'OC-1042' }))
    expect(response.status).toBe(400)
    const whitespace = await dismiss(new Request('http://local', { method: 'POST', body: JSON.stringify({ reason: '   ' }) }), params({ id: 'OC-1042' }))
    expect(whitespace.status).toBe(400)
  })

  it('returns a handoff only when the incident has one', async () => {
    const found = await handoff(new Request('http://local', { method: 'POST' }), params({ id: 'OC-1029' }))
    expect(found.status).toBe(200)
    const missing = await handoff(new Request('http://local', { method: 'POST' }), params({ id: 'unknown' }))
    expect(missing.status).toBe(404)
  })

  it('persists dismiss and reopen commands', async () => {
    demoRuntime.reset()
    const dismissed = await dismiss(new Request('http://local', {
      method: 'POST',
      body: JSON.stringify({ reason: 'Handled elsewhere' }),
    }), params({ id: 'OC-1042' }))
    expect(dismissed.status).toBe(204)
    expect(demoRuntime.incident('OC-1042')?.state).toBe('DISCARDED')
    const reopened = await reopen(new Request('http://local', { method: 'POST' }), params({ id: 'OC-1042' }))
    expect(reopened.status).toBe(204)
    expect(demoRuntime.incident('OC-1042')?.state).toBe('CANDIDATE')
  })

  it('serves an isolated version and reverts it through the config route', async () => {
    demoRuntime.reset()
    const applied = await apply(new Request('http://local/v1/incidents/OC-1042/apply', {
      method: 'POST',
      body: JSON.stringify({ scope: 'USER' }),
    }), params({ id: 'OC-1042' }))
    expect(applied.status).toBe(200)

    const reporter = await resolveConfig(new Request('http://local'), params({ agent: DEMO_AGENT, userHash: DEMO_REPORTER_HASH }))
    const control = await resolveConfig(new Request('http://local'), params({ agent: DEMO_AGENT, userHash: DEMO_CONTROL_HASH }))
    expect((await reporter.json() as { version: number }).version).toBe(2)
    expect((await control.json() as { version: number }).version).toBe(1)

    const reverted = await revert(new Request('http://local/v1/config/ops-copilot/revert', {
      method: 'POST',
      body: JSON.stringify({ userHash: DEMO_REPORTER_HASH }),
    }))
    expect(reverted.status).toBe(200)
    const after = await resolveConfig(new Request('http://local'), params({ agent: DEMO_AGENT, userHash: DEMO_REPORTER_HASH }))
    expect((await after.json() as { version: number }).version).toBe(1)
  })
})
