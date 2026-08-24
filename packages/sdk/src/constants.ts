export const CONFIG_CACHE_TTL_MS = 5_000
export const CONFIG_TIMEOUT_MS = 200
export const CONFIG_MAX_DIFF_BYTES = 4_096
/** Bound on the resolver's per-user cache so a long-lived host cannot leak memory. */
export const CONFIG_CACHE_MAX_ENTRIES = 1_000
/** How long a failed resolution pins its fallback. */
export const CONFIG_FAILURE_CACHE_TTL_MS = 1_000
export const OBSERVATION_QUEUE_CAPACITY = 100
export const OBSERVATION_TIMEOUT_MS = 2_000
export const STORAGE_PREFIX = 'wingman:config'
/** Characters the default scrubber inspects per call. */
export const REDACTION_MAX_INPUT_CHARS = 65_536
