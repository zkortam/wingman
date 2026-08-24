import { createHmac, timingSafeEqual } from 'node:crypto'

interface SignatureInput {
  key: string | Buffer
  agentId: string
  version: number
  config: unknown
  canonicalize: (value: unknown) => string
}

interface VerificationInput extends SignatureInput {
  signature: string
}

export const signVersion = (input: SignatureInput): string =>
  createHmac('sha256', input.key)
    .update(`${input.agentId}.${input.version}.${input.canonicalize(input.config)}`)
    .digest('hex')

export const verifyVersion = (input: VerificationInput): boolean => {
  const expected = Buffer.from(signVersion(input), 'hex')
  const actual = Buffer.from(input.signature, 'hex')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
