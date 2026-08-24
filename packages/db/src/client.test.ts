import { describe, expect, it } from 'vitest'

import { toIsoInstant } from './client'

/**
 * Postgres renders timestamptz as `2026-08-24 21:50:00.123456+00`. The wire
 * contract and the row types are ISO-8601, so returning the column verbatim
 * failed schema validation on every timestamp the database produced.
 */
describe('toIsoInstant', () => {
  it.each([
    ['2026-08-24 21:50:00.123456+00', '2026-08-24T21:50:00.123Z'],
    ['2026-08-24 21:50:00+00', '2026-08-24T21:50:00.000Z'],
    ['2026-08-24 21:50:00.5+00', '2026-08-24T21:50:00.500Z'],
    ['2026-08-24 23:50:00+02', '2026-08-24T21:50:00.000Z'],
    ['2026-08-24 21:20:00-00:30', '2026-08-24T21:50:00.000Z'],
    ['2026-08-25 03:20:00+05:30', '2026-08-24T21:50:00.000Z'],
    ['2026-08-24T21:50:00.123Z', '2026-08-24T21:50:00.123Z'],
  ])('converts %s', (input, expected) => {
    expect(toIsoInstant(input)).toBe(expected)
  })

  it('treats a value with no zone as UTC rather than the host locale', () => {
    expect(toIsoInstant('2026-08-24 21:50:00')).toBe('2026-08-24T21:50:00.000Z')
  })

  it('returns anything it does not recognise unchanged', () => {
    expect(toIsoInstant('not-a-timestamp')).toBe('not-a-timestamp')
  })
})
