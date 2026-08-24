/** Characters inspected per call. */
export const REDACTION_MAX_INPUT_CHARS = 65_536

/** Replaces personal data in text before it leaves the agent host. */
export interface PiiScrubber {
  scrub(value: string): Promise<string>
}

export type PiiCategory =
  | 'EMAIL'
  | 'PHONE'
  | 'SSN'
  | 'CREDIT_CARD'
  | 'IBAN'
  | 'IPV4'
  | 'IPV6'
  | 'MAC'
  | 'JWT'
  | 'AWS_ACCESS_KEY'
  | 'PRIVATE_KEY'
  | 'SECRET'
  | 'URL_CREDENTIALS'

export interface LocalPiiScrubberOptions {
  /** Categories to detect. Defaults to every category. */
  categories?: readonly PiiCategory[]
  /** Extra host-specific detectors, applied after the built-in ones. */
  patterns?: readonly { category: string; pattern: RegExp }[]
  /** Characters scanned per call. */
  maxInputChars?: number
  /** Placeholder builder. Defaults to `[REDACTED_<CATEGORY>]`. */
  placeholder?: (category: string) => string
}

const isLuhn = (value: string): boolean => {
  const digits = value.replace(/\D/g, '')
  if (digits.length < 13 || digits.length > 19) return false
  let sum = 0
  let double = false
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = digits.charCodeAt(index) - 48
    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    double = !double
  }
  return sum % 10 === 0
}

const isIban = (value: string): boolean => {
  const compact = value.replace(/\s+/g, '').toUpperCase()
  if (compact.length < 15 || compact.length > 34) return false
  const rotated = compact.slice(4) + compact.slice(0, 4)
  let remainder = 0
  for (const character of rotated) {
    const code = character.charCodeAt(0)
    const chunk =
      code >= 65 && code <= 90 ? String(code - 55) : code >= 48 && code <= 57 ? character : null
    if (chunk === null) return false
    for (const digit of chunk) remainder = (remainder * 10 + (digit.charCodeAt(0) - 48)) % 97
  }
  return remainder === 1
}

interface Detector {
  category: string
  pattern: RegExp
  /** Higher wins when two detectors match overlapping spans. */
  priority: number
  /** Rejects a syntactic match that fails a checksum or context test. */
  accept?: (match: string) => boolean
  /** Drops the sentence punctuation a greedy tail swallowed. */
  trimTrailing?: boolean
}

/** Deterministic, checksum-validated detectors. */
const DETECTORS: readonly Detector[] = [
  {
    category: 'PRIVATE_KEY',
    // Matched before anything else so a key block is never partially replaced.
    pattern:
      /-----BEGIN [A-Z ]{0,40}PRIVATE KEY-----[\s\S]{0,8000}?-----END [A-Z ]{0,40}PRIVATE KEY-----/g,
    priority: 100,
  },
  {
    category: 'URL_CREDENTIALS',
    // Redacted whole: the path and query of a credentialed URL routinely repeat the same secret, so.
    pattern: /\b[a-z][a-z0-9+.-]{1,20}:\/\/[^\s:/@]{1,128}:[^\s:/@]{1,128}@\S{1,512}/gi,
    priority: 90,
    trimTrailing: true,
  },
  {
    category: 'JWT',
    pattern: /\beyJ[A-Za-z0-9_-]{4,2000}\.[A-Za-z0-9_-]{4,4000}\.[A-Za-z0-9_-]{4,2000}\b/g,
    priority: 85,
  },
  {
    category: 'AWS_ACCESS_KEY',
    pattern: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ABIA|ACCA)[A-Z0-9]{16}\b/g,
    priority: 85,
  },
  {
    category: 'SECRET',
    // Provider-prefixed tokens are unambiguous.
    pattern:
      /\b(?:sk-[A-Za-z0-9_-]{16,128}|sk_live_[A-Za-z0-9]{16,128}|pk_live_[A-Za-z0-9]{16,128}|rk_live_[A-Za-z0-9]{16,128}|ghp_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|ghu_[A-Za-z0-9]{36}|ghs_[A-Za-z0-9]{36}|ghr_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{20,255}|xox[baprs]-[A-Za-z0-9-]{10,255}|glpat-[A-Za-z0-9_-]{20,64})/g,
    priority: 85,
  },
  {
    category: 'EMAIL',
    pattern: /\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){1,8}\b/g,
    priority: 80,
  },
  {
    category: 'IBAN',
    pattern: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,3})?\b/g,
    priority: 70,
    accept: isIban,
  },
  {
    category: 'CREDIT_CARD',
    pattern: /\b(?:\d[ -]?){12,18}\d\b/g,
    priority: 65,
    accept: isLuhn,
  },
  {
    category: 'SSN',
    pattern: /\b(?!000|666|9\d\d)\d{3}[ -](?!00)\d{2}[ -](?!0000)\d{4}\b/g,
    priority: 60,
  },
  {
    category: 'IPV6',
    pattern:
      /\b(?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}\b|\b(?:[0-9A-Fa-f]{1,4}:){1,7}:(?:[0-9A-Fa-f]{1,4})?\b/g,
    priority: 55,
    accept: (value) => value.includes('::') || value.split(':').length === 8,
  },
  {
    category: 'MAC',
    pattern: /\b[0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5}\b/g,
    priority: 52,
  },
  {
    category: 'IPV4',
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    priority: 50,
    accept: (value) => value.split('.').every((part) => Number(part) <= 255 && !/^0\d/.test(part)),
  },
  {
    category: 'PHONE',
    // Anchored against a longer dotted run so version strings and malformed addresses are not mistaken.
    pattern:
      /(?<![.\d])(?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)[ .-]?|\d{2,4}[ .-])\d{2,4}[ .-]\d{2,6}(?![.\d])/g,
    priority: 40,
    accept: (value) => {
      const digits = value.replace(/\D/g, '')
      if (digits.length < 7 || digits.length > 15) return false
      // Dates are the most common false positive and the most damaging: turning a timestamp into a.
      if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(value)) return false
      if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}$/.test(value)) return false
      // "10.20.30" is a version; a dot-separated phone number is full length.
      return !value.includes('.') || digits.length >= 10
    },
  },
]

interface Span {
  start: number
  end: number
  category: string
  priority: number
}

/** Wingman's default scrubber. */
export class LocalPiiScrubber implements PiiScrubber {
  readonly #detectors: readonly Detector[]
  readonly #maxInputChars: number
  readonly #placeholder: (category: string) => string

  constructor(options: LocalPiiScrubberOptions = {}) {
    const selected =
      options.categories === undefined
        ? DETECTORS
        : DETECTORS.filter((detector) =>
            (options.categories as readonly string[]).includes(detector.category),
          )
    const extra = (options.patterns ?? []).map((entry, index) => ({
      category: entry.category,
      pattern: ensureGlobal(entry.pattern),
      priority: -1 - index,
    }))
    this.#detectors = [...selected, ...extra]
    this.#maxInputChars = options.maxInputChars ?? REDACTION_MAX_INPUT_CHARS
    this.#placeholder = options.placeholder ?? ((category) => `[REDACTED_${category}]`)
  }

  /** Redacts synchronously. Exposed for callers that cannot await. */
  scrubSync(value: string): string {
    if (value.length === 0) return value
    const truncated = value.length > this.#maxInputChars
    const text = truncated ? value.slice(0, this.#maxInputChars) : value

    const spans: Span[] = []
    for (const detector of this.#detectors) {
      detector.pattern.lastIndex = 0
      for (
        let match = detector.pattern.exec(text);
        match !== null;
        match = detector.pattern.exec(text)
      ) {
        if (match[0].length === 0) {
          detector.pattern.lastIndex += 1
          continue
        }
        const matched = detector.trimTrailing ? match[0].replace(/[.,;:!?)\]}"']+$/, '') : match[0]
        if (matched.length === 0) continue
        if (detector.accept && !detector.accept(matched)) continue
        spans.push({
          start: match.index,
          end: match.index + matched.length,
          category: detector.category,
          priority: detector.priority,
        })
      }
    }

    const tail = truncated ? this.#placeholder('TRUNCATED') : ''
    if (spans.length === 0) return `${text}${tail}`

    // Highest priority wins an overlap; equal priority prefers the longer span so a whole match is.
    spans.sort(
      (left, right) =>
        left.start - right.start || right.priority - left.priority || right.end - left.end,
    )

    let result = ''
    let cursor = 0
    for (const span of spans) {
      if (span.start < cursor) continue
      result += text.slice(cursor, span.start) + this.#placeholder(span.category)
      cursor = span.end
    }
    result += text.slice(cursor)
    return `${result}${tail}`
  }

  async scrub(value: string): Promise<string> {
    return this.scrubSync(value)
  }
}

const ensureGlobal = (pattern: RegExp): RegExp =>
  pattern.global ? pattern : new RegExp(pattern.source, `${pattern.flags}g`)

/** The categories the default scrubber detects, in detection order. */
export const DEFAULT_PII_CATEGORIES: readonly PiiCategory[] = DETECTORS.map(
  (detector) => detector.category as PiiCategory,
)

/** Categories that are unambiguous enough for a server-side gate to reject on. */
export const VERIFIABLE_PII_CATEGORIES: readonly PiiCategory[] = [
  'EMAIL',
  'SSN',
  'CREDIT_CARD',
  'IBAN',
  'JWT',
  'AWS_ACCESS_KEY',
  'PRIVATE_KEY',
  'SECRET',
  'URL_CREDENTIALS',
]

export interface PiiFinding {
  category: string
  /** Where the match started, for diagnostics. The matched text is never returned. */
  index: number
}

/** Reports the first high-confidence personal-data match in a string, or null. */
export const detectPii = (
  value: string,
  categories: readonly PiiCategory[] = VERIFIABLE_PII_CATEGORIES,
): PiiFinding | null => {
  if (value.length === 0) return null
  const text =
    value.length > REDACTION_MAX_INPUT_CHARS ? value.slice(0, REDACTION_MAX_INPUT_CHARS) : value
  const selected = new Set<string>(categories)
  for (const detector of DETECTORS) {
    if (!selected.has(detector.category)) continue
    detector.pattern.lastIndex = 0
    for (
      let match = detector.pattern.exec(text);
      match !== null;
      match = detector.pattern.exec(text)
    ) {
      if (match[0].length === 0) {
        detector.pattern.lastIndex += 1
        continue
      }
      if (detector.accept && !detector.accept(match[0])) continue
      return { category: detector.category, index: match.index }
    }
  }
  return null
}
