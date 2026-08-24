/** A stated preference is an instruction about how the agent should behave, and it is not a. */
const DIRECTIVE_PHRASES = [
  'just do it',
  'stop asking',
  "don't ask",
  'do not ask',
  'quit asking',
  'no need to confirm',
  'without asking',
  'keep it short',
  'keep it brief',
  'be brief',
  'be concise',
  'too long',
  'too wordy',
  'simplify',
  'simpler',
  'shorter',
  'less detail',
  'skip the',
  'from now on',
  'every time',
  'always',
  'never',
] as const

/** Present tense, addressed to the agent, about manner rather than outcome. */
const DIRECTIVE_PATTERNS = [
  /^(just|please just)\b/,
  /\bstop\s+\w+ing\b/,
  /\b(don't|do not)\s+\w+\b/,
] as const

export function preferenceStatedConfidence(text: string): number {
  const normalized = normalize(text)
  const phrases = DIRECTIVE_PHRASES.filter((phrase) =>
    normalized.includes(normalizePhrase(phrase)),
  ).length
  if (phrases === 0 && !DIRECTIVE_PATTERNS.some((rule) => rule.test(normalized))) return 0
  // Two independent cues ("just do it, stop asking me") is a durable instruction.
  if (phrases >= 2) return 1
  if (phrases === 1) return 0.7
  return 0.5
}

/** Whether the phrasing generalises past this turn. */
export function isDurablePreference(text: string): boolean {
  const normalized = normalize(text)
  if (/\b(this (one|time)|right now|for now|just this)\b/.test(normalized)) return false
  return /\b(always|never|from now on|every time|going forward|stop|don't|do not)\b/.test(
    normalized,
  )
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizePhrase(value: string): string {
  return value
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
