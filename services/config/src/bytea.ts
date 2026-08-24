/** Decodes a Postgres `bytea` column as PostgREST renders it. */
export const decodeByteaSecret = (value: string | Uint8Array): Buffer => {
  if (typeof value !== 'string') return Buffer.from(value)
  // PostgREST hex-escape form.
  if (/^\\x(?:[0-9a-fA-F]{2})*$/.test(value)) return Buffer.from(value.slice(2), 'hex')
  // Some deployments store the secret as text; treat it as its UTF-8 bytes, which is what the SDK.
  return Buffer.from(value, 'utf8')
}
