import { createHash, createHmac } from 'node:crypto'

import { canonicalJSON } from './canonical.js'
import type { AssertionDefinition } from './assertion.js'
import type { SessionInput } from './session.js'

export function userHash(orgSalt: string | Uint8Array, userId: string): string {
  return createHmac('sha256', orgSalt).update(userId).digest('hex').slice(0, 32)
}

export function taskFingerprint(session: SessionInput, noToolFallback?: string): string | null {
  const firstCall = session.turns.flatMap(({ toolCalls }) => toolCalls).at(0)
  if (firstCall === undefined) return noToolFallback ?? null
  const objectType =
    firstCall.args.objectType ?? firstCall.args.object ?? firstCall.args.type ?? 'unknown'
  return sha256([session.agentId, firstCall.name, canonicalJSON(objectType)].join('|'))
}

export function incidentKey(agentId: string, signalKind: string, fingerprint: string): string {
  return sha256([agentId, signalKind, fingerprint].join('|'))
}

export function assertedIncidentKey(bucketKey: string, identity: string): string {
  return sha256([bucketKey, identity].join('|'))
}

export function assertionIdentity(assertion: AssertionDefinition): string {
  const { kind, ...params } = assertion
  return sha256(canonicalJSON({ kind, ...params }))
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Returns a UUID for a host's session identifier. */
export function sessionUuid(sessionId: string): string {
  if (UUID.test(sessionId)) return sessionId
  const digest = sha256(`wingman.session|${sessionId}`)
  const version = `5${digest.slice(13, 16)}`
  // Variant bits: the first hex digit of the fourth group must be 8, 9, a, or b.
  const variant = `${'89ab'[Number.parseInt(digest.slice(16, 17), 16) % 4] ?? '8'}${digest.slice(17, 20)}`
  return [digest.slice(0, 8), digest.slice(8, 12), version, variant, digest.slice(20, 32)].join('-')
}
