import { createHmac } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { decodeByteaSecret } from './bytea'

/** `orgs.signing_key` is a bytea column. */
describe('decodeByteaSecret', () => {
  it('decodes the PostgREST hex-escape form to the bytes it represents', () => {
    expect(decodeByteaSecret('\\x68656c6c6f').toString('utf8')).toBe('hello')
  })

  it('accepts uppercase hex', () => {
    expect(decodeByteaSecret('\\x48454C4C4F').toString('utf8')).toBe('HELLO')
  })

  it('treats a plain string as its UTF-8 bytes', () => {
    expect(decodeByteaSecret('replace-with-signing-key').toString('utf8')).toBe(
      'replace-with-signing-key',
    )
  })

  it('does not mistake a string that merely starts with backslash-x', () => {
    // Not valid hex, so it must be read as text rather than silently truncated.
    expect(decodeByteaSecret('\\xnot-hex-at-all').toString('utf8')).toBe('\\xnot-hex-at-all')
  })

  it('passes raw bytes through unchanged', () => {
    const bytes = new Uint8Array([1, 2, 3, 250])
    expect([...decodeByteaSecret(bytes)]).toEqual([1, 2, 3, 250])
  })

  it('decodes an empty bytea value', () => {
    expect(decodeByteaSecret('\\x')).toHaveLength(0)
  })

  /** `pnpm bootstrap-config` writes `convert_to('<key>', 'UTF8')`, and the agent host signs with the. */
  it('reproduces the host’s key so both sides compute the same signature', () => {
    const key = 'operator-signing-key'
    const stored = `\\x${Buffer.from(key, 'utf8').toString('hex')}`
    const payload = 'agent.1.{}'
    const host = createHmac('sha256', key).update(payload).digest('hex')
    const server = createHmac('sha256', decodeByteaSecret(stored)).update(payload).digest('hex')
    expect(server).toBe(host)
  })

  it('would not have matched without decoding', () => {
    const key = 'operator-signing-key'
    const stored = `\\x${Buffer.from(key, 'utf8').toString('hex')}`
    const payload = 'agent.1.{}'
    const host = createHmac('sha256', key).update(payload).digest('hex')
    const undecoded = createHmac('sha256', stored).update(payload).digest('hex')
    expect(undecoded).not.toBe(host)
  })
})
