/** The scrubber lives in `@wingman/schema` so the host and the ingest service share one detector. */
export {
  DEFAULT_PII_CATEGORIES,
  LocalPiiScrubber,
  REDACTION_MAX_INPUT_CHARS,
  VERIFIABLE_PII_CATEGORIES,
  detectPii,
} from '@wingman/schema'
export type { LocalPiiScrubberOptions, PiiCategory, PiiFinding, PiiScrubber } from '@wingman/schema'
