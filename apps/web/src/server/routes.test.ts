import { AgentConfigSchema } from '@wingman/schema'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DEMO_AGENT, DEMO_CONTROL_HASH, DEMO_REPORTER_HASH } from '../domain/demo'
import { POST as apply } from '../../app/(api)/v1/incidents/[id]/apply/route'
import { POST as confirm } from '../../app/(api)/v1/incidents/[id]/confirm/route'
import { POST as dismiss } from '../../app/(api)/v1/incidents/[id]/dismiss/route'
import { POST as handoff } from '../../app/(api)/v1/incidents/[id]/handoff/route'
import { POST as reopen } from '../../app/(api)/v1/incidents/[id]/reopen/route'
import { GET as gate } from '../../app/(api)/v1/metrics/gate/route'
import { POST as revert } from '../../app/(api)/v1/config/[agent]/revert/route'
import { GET as versions } from '../../app/(api)/v1/config/[agent]/versions/route'
import { GET as incidents } from '../../app/(api)/v1/incidents/route'
import { GET as outcomes } from '../../app/(api)/v1/outcomes/route'
import { GET as resolveConfig } from '../../app/(read)/v1/config/[agent]/[userHash]/route'
import { POST as ingestEvent } from '../../app/(sdk)/v1/events/route'
import { POST as reviewToolCall } from '../../app/(sdk)/v1/reviews/tool-calls/route'
import { demoRuntime } from './demo-runtime'

const JSON_HEADERS = { 'content-type': 'application/json' }

const params = <T extends Record<string, string>>(value: T): { params: Promise<T> } => ({
  params: Promise.resolve(value),
})

describe('operator and config routes', () => {
  beforeEach(() => vi.stubEnv('WINGMAN_RUNTIME', 'demo'))
  it('validates scope before an apply reaches the command port', async () => {
    const response = await apply(
      new Request('http://local/v1/incidents/OC-1042/apply', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ scope: 'ORG' }),
      }),
      params({ id: 'OC-1042' }),
    )
    expect(response.status).toBe(400)
    const malformed = await apply(
      new Request('http://local', { method: 'POST', headers: JSON_HEADERS, body: '{' }),
      params({ id: 'OC-1042' }),
    )
    expect(malformed.status).toBe(400)
  })

  it('exposes the SDK event receiver and rejects malformed bodies', async () => {
    const accepted = await ingestEvent(
      new Request('http://local/v1/events', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({
          id: 'f561f9b9-2abf-4bb7-a5cd-3b6ad76002b6',
          orgId: '5e8e68e1-a768-4342-b4f4-d9a1f8ceaa26',
          agentId: '4ee0d899-d63d-4bc2-b47a-25aa25c6078b',
          userHash: 'a'.repeat(32),
          startedAt: '2026-08-23T00:00:00.000Z',
          turns: [
            {
              idx: 0,
              role: 'user',
              textRedacted: 'Export these',
              toolCalls: [],
              createdAt: '2026-08-23T00:00:00.000Z',
            },
          ],
          redaction: {
            mode: 'allowlist',
            fields: ['turns'],
            piiScrubbed: true,
            userIdHashed: true,
          },
        }),
      }),
    )
    expect(accepted.status).toBe(202)
    const incomplete = await ingestEvent(
      new Request('http://local/v1/events', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ id: 'integration-event' }),
      }),
    )
    expect(incomplete.status).toBe(400)
    const malformed = await ingestEvent(
      new Request('http://local/v1/events', { method: 'POST', headers: JSON_HEADERS, body: '{' }),
    )
    expect(malformed.status).toBe(400)
  })

  it('validates and serves the SDK tool-review boundary', async () => {
    const response = await reviewToolCall(
      new Request('http://local/v1/reviews/tool-calls', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({
          agentId: '4ee0d899-d63d-4bc2-b47a-25aa25c6078b',
          sessionId: 'f561f9b9-2abf-4bb7-a5cd-3b6ad76002b6',
          userHash: 'a'.repeat(32),
          userMessage: 'Export the current filtered view.',
          proposedCall: { name: 'export_records', args: { filters: { stage: 'Negotiation' } } },
          recentTurns: [],
          context: {},
        }),
      }),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ action: 'ALLOW' })
    const invalid = await reviewToolCall(
      new Request('http://local', { method: 'POST', headers: JSON_HEADERS, body: '{}' }),
    )
    expect(invalid.status).toBe(400)
  })

  it('requires an explicit dismissal reason', async () => {
    const response = await dismiss(
      new Request('http://local', { method: 'POST', headers: JSON_HEADERS, body: '{}' }),
      params({ id: 'OC-1042' }),
    )
    expect(response.status).toBe(400)
    const whitespace = await dismiss(
      new Request('http://local', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ reason: '   ' }),
      }),
      params({ id: 'OC-1042' }),
    )
    expect(whitespace.status).toBe(400)
  })

  it('returns a handoff only when the incident has one', async () => {
    const found = await handoff(
      new Request('http://local', { method: 'POST' }),
      params({ id: 'OC-1029' }),
    )
    expect(found.status).toBe(200)
    const missing = await handoff(
      new Request('http://local', { method: 'POST' }),
      params({ id: 'unknown' }),
    )
    expect(missing.status).toBe(404)
  })

  it('persists dismiss and reopen commands', async () => {
    demoRuntime.reset()
    const dismissed = await dismiss(
      new Request('http://local', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ reason: 'Handled elsewhere' }),
      }),
      params({ id: 'OC-1042' }),
    )
    expect(dismissed.status).toBe(204)
    expect(demoRuntime.incident('OC-1042')?.state).toBe('DISCARDED')
    const reopened = await reopen(
      new Request('http://local', { method: 'POST' }),
      params({ id: 'OC-1042' }),
    )
    expect(reopened.status).toBe(204)
    expect(demoRuntime.incident('OC-1042')?.state).toBe('CLUSTERED')
  })

  it('serves an isolated version and reverts it through the config route', async () => {
    demoRuntime.reset()
    const applied = await apply(
      new Request('http://local/v1/incidents/OC-1042/apply', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ scope: 'USER' }),
      }),
      params({ id: 'OC-1042' }),
    )
    expect(applied.status).toBe(200)

    const reporter = await resolveConfig(
      new Request('http://local'),
      params({ agent: DEMO_AGENT, userHash: DEMO_REPORTER_HASH }),
    )
    const control = await resolveConfig(
      new Request('http://local'),
      params({ agent: DEMO_AGENT, userHash: DEMO_CONTROL_HASH }),
    )
    const reporterPayload = (await reporter.json()) as { config: unknown; version: number }
    expect(reporterPayload.version).toBe(2)
    expect(AgentConfigSchema.safeParse(reporterPayload.config).success).toBe(true)
    expect(((await control.json()) as { version: number }).version).toBe(1)

    const reverted = await revert(
      new Request('http://local/v1/config/ops-copilot/revert', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ userHash: DEMO_REPORTER_HASH, incidentId: 'OC-1042' }),
      }),
      params({ agent: DEMO_AGENT }),
    )
    expect(reverted.status).toBe(200)
    expect(demoRuntime.incident('OC-1042')?.state).toBe('REVERTED')
    const after = await resolveConfig(
      new Request('http://local'),
      params({ agent: DEMO_AGENT, userHash: DEMO_REPORTER_HASH }),
    )
    expect(((await after.json()) as { version: number }).version).toBe(1)
  })

  it('contains production config outages so SDK clients can use local fallback', async () => {
    vi.stubEnv('WINGMAN_RUNTIME', 'production')
    vi.stubEnv('WINGMAN_API_KEY', 'sdk-secret')
    vi.stubEnv('DATABASE_URL', '')
    const response = await resolveConfig(
      new Request('http://local', { headers: { authorization: 'Bearer sdk-secret' } }),
      params({ agent: '4ee0d899-d63d-4bc2-b47a-25aa25c6078b', userHash: 'a'.repeat(32) }),
    )
    expect(response.status).toBe(503)
  })

  it('contains production control-plane outages behind stable 503 responses', async () => {
    vi.stubEnv('WINGMAN_RUNTIME', 'production')
    vi.stubEnv('DATABASE_URL', '')

    await expect(incidents()).resolves.toMatchObject({ status: 503 })
    await expect(outcomes()).resolves.toMatchObject({ status: 503 })
    await expect(
      versions(new Request('http://local'), params({ agent: DEMO_AGENT })),
    ).resolves.toMatchObject({ status: 503 })

    const applyResponse = await apply(
      new Request('http://local', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ scope: 'USER' }),
      }),
      params({ id: 'OC-1042' }),
    )
    const dismissResponse = await dismiss(
      new Request('http://local', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ reason: 'Operator decision' }),
      }),
      params({ id: 'OC-1042' }),
    )
    const handoffResponse = await handoff(
      new Request('http://local', { method: 'POST' }),
      params({ id: 'OC-1029' }),
    )
    const reopenResponse = await reopen(
      new Request('http://local', { method: 'POST' }),
      params({ id: 'OC-1042' }),
    )
    const revertResponse = await revert(
      new Request('http://local', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ userHash: DEMO_REPORTER_HASH, incidentId: 'OC-1042' }),
      }),
      params({ agent: DEMO_AGENT }),
    )
    expect([
      applyResponse.status,
      dismissResponse.status,
      handoffResponse.status,
      reopenResponse.status,
      revertResponse.status,
    ]).toEqual([503, 503, 503, 503, 503])
    await expect(
      confirm(new Request('http://local', { method: 'POST' }), params({ id: 'OC-1042' })),
    ).resolves.toMatchObject({ status: 503 })
    await expect(gate()).resolves.toMatchObject({ status: 503 })
  })

  it('confirms an applied incident and refuses a second confirmation', async () => {
    demoRuntime.reset()
    const applied = await apply(
      new Request('http://local', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ scope: 'USER' }),
      }),
      params({ id: 'OC-1042' }),
    )
    expect(applied.status).toBe(200)
    const confirmed = await confirm(
      new Request('http://local', { method: 'POST' }),
      params({ id: 'OC-1042' }),
    )
    expect(confirmed.status).toBe(204)
    expect(demoRuntime.incident('OC-1042')?.state).toBe('CONFIRMED')
    const again = await confirm(
      new Request('http://local', { method: 'POST' }),
      params({ id: 'OC-1042' }),
    )
    expect(again.status).toBe(409)
    const missing = await confirm(
      new Request('http://local', { method: 'POST' }),
      params({ id: 'unknown' }),
    )
    expect(missing.status).toBe(404)
  })

  it('reports demo gate precision and escalates an undeclared tool without a model', async () => {
    const precision = await gate()
    expect(precision.status).toBe(200)
    expect(await precision.json()).toEqual({ precision: 1, n: 6 })

    const unknown = await reviewToolCall(
      new Request('http://local/v1/reviews/tool-calls', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({
          agentId: '4ee0d899-d63d-4bc2-b47a-25aa25c6078b',
          sessionId: 'f561f9b9-2abf-4bb7-a5cd-3b6ad76002b6',
          userHash: 'a'.repeat(32),
          userMessage: 'Drop the production database.',
          proposedCall: { name: 'delete_database', args: {} },
          recentTurns: [],
          context: {},
        }),
      }),
    )
    expect(unknown.status).toBe(200)
    expect(await unknown.json()).toMatchObject({ action: 'ESCALATE', source: 'POLICY' })
  })

  it('rejects unauthenticated SDK traffic in production', async () => {
    vi.stubEnv('WINGMAN_RUNTIME', 'production')
    vi.stubEnv('WINGMAN_API_KEY', 'sdk-secret')
    const unauthorized = await reviewToolCall(
      new Request('http://local/v1/reviews/tool-calls', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({}),
      }),
    )
    expect(unauthorized.status).toBe(401)
    const events = await ingestEvent(
      new Request('http://local/v1/events', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({}),
      }),
    )
    expect(events.status).toBe(401)
    const authorizedInvalid = await reviewToolCall(
      new Request('http://local/v1/reviews/tool-calls', {
        method: 'POST',
        headers: { authorization: 'Bearer sdk-secret' },
        body: JSON.stringify({}),
      }),
    )
    expect(authorizedInvalid.status).toBe(400)
  })
})
