import { z } from 'zod'

/** An ISO-8601 instant, with or without a UTC offset. */
export const IsoDateTimeSchema = z.string().datetime({
  offset: true,
  message:
    'Expected an ISO-8601 timestamp with a UTC offset, such as 2026-09-01T10:00:00Z or 2026-09-01T12:00:00+02:00',
})

export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>

/** Normalizes any accepted instant to the canonical `Z` form used for storage. */
export const toUtcInstant = (value: string): string => new Date(value).toISOString()
