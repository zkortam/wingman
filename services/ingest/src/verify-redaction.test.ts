import { randomUUID } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { RedactionVerificationError, verifyRedaction } from './verify-redaction.js'

function payload() {
  return {
    id: randomUUID(),
    orgId: randomUUID(),
    agentId: randomUUID(),
    userHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    startedAt: '2026-08-23T00:00:00.000Z',
    turns: [
      {
        idx: 0,
        role: 'user',
        textRedacted: 'Search records',
        toolCalls: [] as Array<{
          id: string
          name: string
          args: Record<string, string>
        }>,
        createdAt: '2026-08-23T00:00:00.000Z',
      },
    ],
    redaction: {
      mode: 'allowlist',
      fields: ['turns'],
      piiScrubbed: true,
      userIdHashed: true,
    },
  }
}

describe('verifyRedaction', () => {
  it('accepts a strict allowlisted envelope', () => {
    expect(verifyRedaction(payload()).userHash).toHaveLength(32)
  })

  it('rejects raw IDs, unknown fields, and nested identity fields', () => {
    expect(() => verifyRedaction({ ...payload(), userId: 'raw-user' })).toThrow()
    const nested = payload()
    const [firstTurn] = nested.turns
    if (firstTurn === undefined) throw new Error('fixture needs one turn')
    firstTurn.toolCalls = [{ id: 'call', name: 'search', args: { email: 'raw@example.com' } }]
    expect(() => verifyRedaction(nested)).toThrow(RedactionVerificationError)
  })

  it('rejects optional fields that were not allowlisted', () => {
    expect(() => verifyRedaction({ ...payload(), lastQuery: 'secret search' })).toThrow(
      RedactionVerificationError,
    )
  })
})

/** The redaction proof asserts `piiScrubbed: true`. */
describe('the redaction gate inspects content, not just field names', () => {
  const session = (text: string) => ({
    id: '11111111-1111-4111-8111-111111111111',
    orgId: '22222222-2222-4222-8222-222222222222',
    agentId: '33333333-3333-4333-8333-333333333333',
    userHash: 'a'.repeat(32),
    startedAt: '2026-08-01T00:00:00.000Z',
    turns: [
      {
        idx: 0,
        role: 'user' as const,
        textRedacted: text,
        toolCalls: [],
        createdAt: '2026-08-01T00:00:00.000Z',
      },
    ],
    redaction: {
      mode: 'allowlist' as const,
      fields: ['turns'],
      piiScrubbed: true as const,
      userIdHashed: true as const,
    },
  })

  it.each([
    ['an email address', 'Contact jane@example.com about the order.'],
    ['a social security number', 'My SSN is 123-45-6789.'],
    ['a credit card number', 'Charge 4111 1111 1111 1111 now.'],
    ['an API key', 'Use sk-abcdefghijklmnopqrstuvwx to call it.'],
    ['a GitHub token', 'push with ghp_abcdefghijklmnopqrstuvwxyz0123456789'],
    [
      'a private key block',
      '-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAK\n-----END RSA PRIVATE KEY-----',
    ],
    ['credentials in a URL', 'clone https://alice:hunter2@git.example.com/repo.git'],
  ])('rejects a session whose turn text still contains %s', (_name, text) => {
    expect(() => verifyRedaction(session(text))).toThrow(RedactionVerificationError)
  })

  it('names the category without echoing the value', () => {
    try {
      verifyRedaction(session('Contact jane@example.com.'))
      expect.unreachable('expected a redaction failure')
    } catch (error) {
      expect(String(error)).toContain('EMAIL')
      expect(String(error)).not.toContain('jane@example.com')
    }
  })

  it('accepts a properly scrubbed session', () => {
    expect(() =>
      verifyRedaction(session('Contact [REDACTED_EMAIL] about the order.')),
    ).not.toThrow()
  })

  it('accepts ordinary prose that contains no personal data', () => {
    expect(() =>
      verifyRedaction(session('Please export the records filtered to stage New.')),
    ).not.toThrow()
  })

  it.each(['emailAddress', 'user_email', 'apiKey', 'authorization', 'creditCard', 'e-mail'])(
    'rejects a tool argument keyed %s',
    (key) => {
      const payload = session('nothing sensitive here')
      const [turn] = payload.turns
      if (turn === undefined) expect.unreachable('fixture has a turn')
      else turn.toolCalls = [{ name: 'export', args: { [key]: 'value' } }] as never
      expect(() => verifyRedaction(payload)).toThrow(RedactionVerificationError)
    },
  )

  it('rejects personal data hiding inside a tool argument', () => {
    const payload = session('nothing sensitive here')
    const [turn] = payload.turns
    if (turn === undefined) expect.unreachable('fixture has a turn')
    else turn.toolCalls = [{ name: 'export', args: { note: 'send to jane@example.com' } }] as never
    expect(() => verifyRedaction(payload)).toThrow(RedactionVerificationError)
  })

  it('rejects personal data in a telemetry correlation identifier', () => {
    const payload = {
      ...session('clean'),
      telemetry: { convention: 'opentelemetry-genai', externalTraceId: 'jane@example.com' },
    }
    expect(() => verifyRedaction(payload)).toThrow(RedactionVerificationError)
  })
})
