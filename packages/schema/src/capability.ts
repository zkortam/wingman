import { createHash } from 'node:crypto'
import { z } from 'zod'

import { CapabilityStateSchema } from './enums.js'
import { IsoDateTimeSchema } from './time.js'

/** Demand for something the agent cannot do. */
export const CapabilityRequestSchema = z
  .object({
    id: z.string().uuid(),
    orgId: z.string().uuid(),
    agentId: z.string().uuid(),
    /** Stable across users and sessions so demand accumulates instead of fragmenting. */
    key: z.string().regex(/^[a-f0-9]{64}$/),
    title: z.string().min(1),
    /** The tool the user's request implied, when one can be named. */
    impliedTool: z.string().min(1).nullable(),
    /** Distinct requesters. Held as hashes so a count never becomes a customer list. */
    userHashes: z.array(z.string().regex(/^[a-f0-9]{32}$/)),
    sessionIds: z.array(z.string().uuid()),
    evidenceExcerpts: z.array(z.string()),
    state: CapabilityStateSchema,
    firstSeen: IsoDateTimeSchema,
    lastSeen: IsoDateTimeSchema,
  })
  .strict()
export type CapabilityRequest = z.infer<typeof CapabilityRequestSchema>

/** Distinct users, not distinct requests — one frustrated user asking six times is one unit of. */
export function capabilityDemand(request: CapabilityRequest): number {
  return new Set(request.userHashes).size
}

/** Buckets a gap so the same missing capability collides across users. */
export function capabilityKey(input: {
  agentId: string
  impliedTool: string | null
  phrase: string
}): string {
  const discriminator = input.impliedTool ?? input.phrase.trim().toLowerCase().replace(/\s+/g, ' ')
  return createHash('sha256').update([input.agentId, discriminator].join('|')).digest('hex')
}
