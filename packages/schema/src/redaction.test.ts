import { describe, expect, it } from 'vitest'

import { DEFAULT_PII_CATEGORIES, LocalPiiScrubber, REDACTION_MAX_INPUT_CHARS } from './redaction'

const scrubber = new LocalPiiScrubber()
const scrub = (value: string): string => scrubber.scrubSync(value)

/** Redaction has two failure modes and both are damaging: leaking personal data downstream, and. */
describe('LocalPiiScrubber removes personal data', () => {
  const leaks: [string, string, string][] = [
    ['email', 'Contact jane@example.com about the order.', 'jane@example.com'],
    [
      'email with plus tag',
      'ops+alerts@sub.example.co.uk raised it.',
      'ops+alerts@sub.example.co.uk',
    ],
    ['US social security number', 'My SSN is 123-45-6789 for the form.', '123-45-6789'],
    ['space-separated SSN', 'SSN 123 45 6789 on file.', '123 45 6789'],
    ['credit card', 'Charge card 4111 1111 1111 1111 today.', '4111 1111 1111 1111'],
    ['hyphenated credit card', 'Card 5500-0000-0000-0004 declined.', '5500-0000-0000-0004'],
    ['IPv4 address', 'Server 192.168.1.42 is unreachable.', '192.168.1.42'],
    [
      'IPv6 address',
      'Host 2001:0db8:85a3:0000:0000:8a2e:0370:7334 timed out.',
      '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
    ],
    ['MAC address', 'Adapter 00:1B:44:11:3A:B7 dropped.', '00:1B:44:11:3A:B7'],
    ['international phone', 'Call +1 (415) 555-0132 after nine.', '555-0132'],
    ['dotted phone', 'Reach me on 415.555.0132 tonight.', '415.555.0132'],
    ['IBAN', 'Send to GB82 WEST 1234 5698 7654 32 please.', 'GB82 WEST 1234 5698 7654 32'],
    [
      'bearer JWT',
      'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk',
      'eyJhbGciOiJIUzI1NiJ9',
    ],
    ['AWS access key', 'key AKIAIOSFODNN7EXAMPLE rotated', 'AKIAIOSFODNN7EXAMPLE'],
    [
      'OpenAI-style secret',
      'use sk-abcdefghijklmnopqrstuvwx for the call',
      'sk-abcdefghijklmnopqrstuvwx',
    ],
    [
      'GitHub token',
      'push with ghp_abcdefghijklmnopqrstuvwxyz0123456789 now',
      'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    ],
    ['Slack token', 'bot xoxb-123456789012-abcdefghijkl posted', 'xoxb-123456789012-abcdefghijkl'],
    ['URL credentials', 'clone https://alice:hunter2@git.example.com/repo.git', 'hunter2'],
    [
      'private key block',
      '-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAK\n-----END RSA PRIVATE KEY-----',
      'MIIBOgIBAAJBAK',
    ],
  ]

  for (const [name, input, secret] of leaks) {
    it(`redacts a ${name}`, () => {
      const output = scrub(input)
      expect(output).not.toContain(secret)
      expect(output).toContain('[REDACTED_')
    })
  }

  it('redacts every occurrence, not only the first', () => {
    const output = scrub('a@example.com and b@example.com and c@example.com')
    expect(output).toBe('[REDACTED_EMAIL] and [REDACTED_EMAIL] and [REDACTED_EMAIL]')
  })

  it('redacts personal data embedded in structured text', () => {
    const output = scrub('{"email":"jane@example.com","ip":"10.0.0.7"}')
    expect(output).toBe('{"email":"[REDACTED_EMAIL]","ip":"[REDACTED_IPV4]"}')
  })
})

describe('LocalPiiScrubber preserves the text the reviewer needs', () => {
  const preserved = [
    'Please export the records filtered to stage New.',
    'The quick brown fox jumps over the lazy dog.',
    'Zakaria asked Ali to re-run the report for the Berlin office.',
    'Cancel order 12345 and refund the customer.',
    'Set the threshold to 0.75 and retry three times.',
    'Deploy version 2.4.1 to production at 14:30 UTC.',
    'The incident id is 7f3a91b2c4d5e6f708192a3b4c5d6e7f.',
    'Use tool export_records with filters {"stage":"New"}.',
    'SELECT id, name FROM orders WHERE status = 42;',
    'https://docs.example.com/guides/getting-started?ref=nav#install',
  ]

  for (const sentence of preserved) {
    it(`leaves untouched: ${sentence.slice(0, 40)}`, () => {
      expect(scrub(sentence)).toBe(sentence)
    })
  }

  it('does not treat a bare identifier as a phone number or card', () => {
    expect(scrub('Order 4111111111111112 was rejected.')).toBe(
      'Order 4111111111111112 was rejected.',
    )
    expect(scrub('Reference 1234567890 is closed.')).toBe('Reference 1234567890 is closed.')
  })

  it('does not treat a version or semver range as an IP address', () => {
    expect(scrub('Upgrade from 1.2.3 to 10.20.30 today.')).toBe(
      'Upgrade from 1.2.3 to 10.20.30 today.',
    )
  })

  /** Timestamps travel in every observed turn and every review request. */
  it.each([
    '2026-09-01',
    '2026-09-01T10:00:00.000Z',
    '2026-01-01T00:00:00.000Z',
    '01/09/2026',
    '09-01-2026',
  ])('never redacts the timestamp %s', (timestamp) => {
    expect(scrub(timestamp)).toBe(timestamp)
  })

  it('preserves timestamps inside a serialised turn', () => {
    const turn = '{"idx":0,"role":"user","createdAt":"2026-09-01T10:00:00.000Z"}'
    expect(scrub(turn)).toBe(turn)
  })

  it('rejects an out-of-range dotted quad', () => {
    expect(scrub('Build 999.888.777.666 failed.')).toBe('Build 999.888.777.666 failed.')
  })
})

describe('LocalPiiScrubber is deterministic and bounded', () => {
  it('produces byte-identical output for identical input', () => {
    const input = 'Email jane@example.com from 10.0.0.7 about card 4111 1111 1111 1111.'
    expect(scrub(input)).toBe(scrub(input))
  })

  it('never emits a random or per-call token', () => {
    expect(scrub('jane@example.com')).toBe('[REDACTED_EMAIL]')
  })

  it('truncates rather than scanning an unbounded payload', () => {
    const output = scrub(`${'a'.repeat(REDACTION_MAX_INPUT_CHARS + 500)} jane@example.com`)
    expect(output).toContain('[REDACTED_TRUNCATED]')
    expect(output.length).toBeLessThanOrEqual(
      REDACTION_MAX_INPUT_CHARS + '[REDACTED_TRUNCATED]'.length,
    )
  })

  it('completes a hostile repetitive input well inside a request budget', () => {
    const hostile = `${'1-'.repeat(20_000)}@${'a'.repeat(2_000)}`
    const started = performance.now()
    scrub(hostile)
    expect(performance.now() - started).toBeLessThan(1_000)
  })

  it('returns empty input unchanged', () => {
    expect(scrub('')).toBe('')
  })

  it('resolves overlapping detections to the highest-priority whole match', () => {
    // The URL carries both credentials and a host that parses as a dotted quad; the credential span.
    expect(scrub('use https://u:p@10.0.0.7/path now')).toBe('use [REDACTED_URL_CREDENTIALS] now')
  })
})

describe('LocalPiiScrubber is configurable', () => {
  it('honours a category allowlist', () => {
    const emailOnly = new LocalPiiScrubber({ categories: ['EMAIL'] })
    expect(emailOnly.scrubSync('jane@example.com at 10.0.0.7')).toBe('[REDACTED_EMAIL] at 10.0.0.7')
  })

  it('accepts host-specific patterns', () => {
    const custom = new LocalPiiScrubber({
      categories: [],
      patterns: [{ category: 'EMPLOYEE_ID', pattern: /\bEMP-\d{6}\b/g }],
    })
    expect(custom.scrubSync('ticket for EMP-004221')).toBe('ticket for [REDACTED_EMPLOYEE_ID]')
  })

  it('adds a global flag to a caller pattern that lacks one', () => {
    const custom = new LocalPiiScrubber({
      categories: [],
      patterns: [{ category: 'CODE', pattern: /\bZZ-\d\b/ }],
    })
    expect(custom.scrubSync('ZZ-1 and ZZ-2')).toBe('[REDACTED_CODE] and [REDACTED_CODE]')
  })

  it('honours a custom placeholder', () => {
    const custom = new LocalPiiScrubber({ placeholder: () => '***' })
    expect(custom.scrubSync('jane@example.com')).toBe('***')
  })

  it('publishes the categories it detects', () => {
    expect(DEFAULT_PII_CATEGORIES).toContain('EMAIL')
    expect(DEFAULT_PII_CATEGORIES).toContain('CREDIT_CARD')
    expect(new Set(DEFAULT_PII_CATEGORIES).size).toBe(DEFAULT_PII_CATEGORIES.length)
  })

  it('exposes the async PiiScrubber contract', async () => {
    await expect(scrubber.scrub('jane@example.com')).resolves.toBe('[REDACTED_EMAIL]')
  })
})
