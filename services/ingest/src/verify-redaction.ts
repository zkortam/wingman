import { SessionInputSchema, detectPii, type JsonValue, type SessionInput } from '@wingman/schema'

/** Key names that carry raw identity by convention. */
const RAW_IDENTITY_KEY_PARTS = [
  'email',
  'phone',
  'ssn',
  'socialsecurity',
  'password',
  'passwd',
  'secret',
  'token',
  'apikey',
  'authorization',
  'credential',
  'creditcard',
  'cardnumber',
  'userid',
  'username',
]

const normalizeKey = (key: string): string => key.toLowerCase().replace(/[^a-z]/g, '')

const isRawIdentityKey = (key: string): boolean => {
  const normalized = normalizeKey(key)
  return RAW_IDENTITY_KEY_PARTS.some((part) => normalized.includes(part))
}

export class RedactionVerificationError extends Error {
  constructor(readonly path: string) {
    super(`Payload contains a field that should have been redacted: ${path}`)
    this.name = 'RedactionVerificationError'
  }
}

const OPTIONAL_FIELDS = new Set([
  'personaId',
  'viewFilters',
  'selectedIds',
  'dateRange',
  'lastQuery',
  'userRules',
])

/** Enforces the redaction proof a host attaches to a session. */
export function verifyRedaction(input: unknown): SessionInput {
  const session = SessionInputSchema.parse(input)
  const allowed = new Set(session.redaction.fields)
  for (const field of OPTIONAL_FIELDS) {
    if (session[field as keyof SessionInput] !== undefined && !allowed.has(field)) {
      throw new RedactionVerificationError(field)
    }
  }
  for (const turn of session.turns) {
    inspectValue(turn.textRedacted, `turns.${turn.idx}.textRedacted`)
    for (const call of turn.toolCalls) {
      inspectValue(call.name, `turns.${turn.idx}.toolCalls.${call.id ?? 'anon'}.name`)
      inspectObject(call.args, `turns.${turn.idx}.toolCalls.${call.id ?? 'anon'}.args`)
    }
  }
  inspectValue(session.viewFilters, 'viewFilters')
  inspectValue(session.dateRange, 'dateRange')
  inspectValue(session.lastQuery, 'lastQuery')
  inspectValue(session.selectedIds, 'selectedIds')
  inspectValue(session.userRules, 'userRules')
  // Correlation identifiers are host-authored free text and reach the database like everything else.
  if (session.telemetry !== undefined) {
    inspectValue(session.telemetry.externalTraceId, 'telemetry.externalTraceId')
    inspectValue(session.telemetry.convention, 'telemetry.convention')
  }
  return session
}

function inspectValue(value: JsonValue | string | undefined, path: string): void {
  if (value === undefined || value === null) return
  if (typeof value === 'string') {
    const finding = detectPii(value)
    // The matched text is never echoed: this runs server-side, and putting the value in an error.
    if (finding !== null) throw new RedactionVerificationError(`${path} (${finding.category})`)
    return
  }
  if (typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectValue(entry, `${path}.${index}`))
    return
  }
  inspectObject(value, path)
}

function inspectObject(value: Record<string, JsonValue>, path: string): void {
  for (const [key, entry] of Object.entries(value)) {
    if (isRawIdentityKey(key)) throw new RedactionVerificationError(`${path}.${key}`)
    inspectValue(entry, `${path}.${key}`)
  }
}
