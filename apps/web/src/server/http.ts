import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

export const isSdkAuthorized = (request: Request): boolean => {
  if (process.env.WINGMAN_RUNTIME === 'demo') return true
  const expected = process.env.WINGMAN_API_KEY
  const header = request.headers.get('authorization')
  if (!expected || !header?.startsWith('Bearer ')) return false
  const actual = header.slice('Bearer '.length)
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(actual), digest(expected))
}

/** Reads a JSON object body. */
export const readJsonObject = async (request: Request): Promise<Record<string, unknown> | null> => {
  const contentType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') return null
  try {
    const value = (await request.json()) as unknown
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

export const jsonError = (status: number, message: string): NextResponse =>
  NextResponse.json({ error: message }, { status })

export const operatorError = (
  error: unknown,
  input: {
    conflict?: RegExp
    conflictMessage?: string
    notFoundMessage?: string
  } = {},
): NextResponse => {
  const message = error instanceof Error ? error.message : String(error)
  if (input.conflict?.test(message)) {
    return jsonError(409, input.conflictMessage ?? 'Operator command rejected')
  }
  if (input.notFoundMessage && isNotFound(error)) {
    return jsonError(404, input.notFoundMessage)
  }
  return jsonError(503, 'Operator service unavailable')
}

const isNotFound = (error: unknown): boolean => {
  let current: unknown = error
  for (let depth = 0; depth < 4 && current !== null; depth += 1) {
    if (typeof current !== 'object') break
    if ('code' in current && current.code === 'PGRST116') return true
    if (current instanceof Error && /not found/i.test(current.message)) return true
    current = 'cause' in current ? current.cause : null
  }
  return false
}
