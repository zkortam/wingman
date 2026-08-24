const RETRY_PHRASES = [
  'try again',
  'look again',
  "that's wrong",
  'that is wrong',
  'try harder',
  'no, i meant',
  'no i meant',
] as const

export function retryRequestConfidence(text: string): number {
  const normalized = normalize(text)
  if (RETRY_PHRASES.some((phrase) => normalized.includes(phrase))) return 1
  if (/^(n+o+|wrong|incorrect)\b/.test(normalized)) return 0.8
  if (/\b(i said|not cancel)/.test(normalized)) return 0.8
  return 0
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
