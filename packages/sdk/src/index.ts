import { AgentConfigSchema, type AgentConfig, type Rule } from '@wingman/schema'

import {
  CONFIG_MAX_DIFF_BYTES,
  OBSERVATION_QUEUE_CAPACITY,
  OBSERVATION_TIMEOUT_MS,
} from './constants.js'
import { classifyStatus, report, type DiagnosticListener } from './diagnostics.js'
import { hashUserId } from './hash.js'
import { ObservationQueue, type ObservationQueueStats } from './observe.js'
import { LocalPiiScrubber, type PiiScrubber } from './redaction.js'
import { ConfigResolver, type ConfigSource } from './resolve.js'
import {
  ToolReviewClient,
  type ReviewMcpToolCallInput,
  type ReviewToolCallInput,
  type ToolReviewOptions,
} from './review.js'
import { prepareSession, type SessionObservationInput } from './session.js'
import { FileConfigStorage, type ConfigStorage } from './storage.js'
import { withTimeout } from './timeout.js'

export interface ObservationOptions {
  /** Sessions held in memory before the oldest is dropped. */
  capacity?: number
  /** Deadline for one delivery attempt. */
  timeoutMs?: number
  /** Concurrent deliveries during a flush. */
  concurrency?: number
  /** Delivery attempts per session before it is dropped. */
  maxAttempts?: number
  /** Drains the queue automatically this often. */
  autoFlushMs?: number
}

export interface InitOptions {
  endpoint: string
  apiKey: string
  orgId: string
  orgSalt: string
  signingKey: string
  baseConfig: AgentConfig
  defaultAgent: string
  writable: string[]
  maxDiffBytes?: number
  redact: { fields: string[] }
  validate?: (config: AgentConfig) => boolean
  fetcher?: typeof fetch
  storage?: ConfigStorage
  scrubber?: PiiScrubber
  config?: { timeoutMs?: number; cacheTtlMs?: number; maxCacheEntries?: number }
  review?: ToolReviewOptions
  observation?: ObservationOptions
  /** Receives every contained failure. */
  onDiagnostic?: DiagnosticListener
}

export class WingmanClient {
  readonly #options: InitOptions
  readonly #resolver: ConfigResolver
  readonly #queue: ObservationQueue
  readonly #scrubber: PiiScrubber
  readonly #reviewer: ToolReviewClient
  readonly #observationTimeoutMs: number
  #autoFlush: ReturnType<typeof setInterval> | undefined

  constructor(options: InitOptions) {
    validateOptions(options)
    const endpoint = normalizeEndpoint(options.endpoint)
    const baseConfig = AgentConfigSchema.parse(structuredClone(options.baseConfig))
    const writable = [...options.writable]
    this.#options = {
      ...options,
      endpoint,
      baseConfig,
      writable,
      redact: { fields: [...options.redact.fields] },
    }
    this.#observationTimeoutMs = options.observation?.timeoutMs ?? OBSERVATION_TIMEOUT_MS
    this.#scrubber = options.scrubber ?? new LocalPiiScrubber()
    this.#resolver = new ConfigResolver({
      endpoint,
      apiKey: options.apiKey,
      baseConfig,
      signingKey: options.signingKey,
      writablePaths: writable,
      maxDiffBytes: options.maxDiffBytes ?? CONFIG_MAX_DIFF_BYTES,
      ...(options.validate ? { validate: options.validate } : {}),
      ...(options.fetcher ? { fetcher: options.fetcher } : {}),
      storage: options.storage ?? new FileConfigStorage(),
      ...(options.config?.timeoutMs === undefined ? {} : { timeoutMs: options.config.timeoutMs }),
      ...(options.config?.cacheTtlMs === undefined
        ? {}
        : { cacheTtlMs: options.config.cacheTtlMs }),
      ...(options.config?.maxCacheEntries === undefined
        ? {}
        : { maxCacheEntries: options.config.maxCacheEntries }),
      ...(options.onDiagnostic ? { onDiagnostic: options.onDiagnostic } : {}),
    })
    this.#queue = new ObservationQueue({
      capacity: options.observation?.capacity ?? OBSERVATION_QUEUE_CAPACITY,
      send: (item) => this.#send(item),
      ...(options.observation?.concurrency === undefined
        ? {}
        : { concurrency: options.observation.concurrency }),
      ...(options.observation?.maxAttempts === undefined
        ? {}
        : { maxAttempts: options.observation.maxAttempts }),
      ...(options.onDiagnostic ? { onDiagnostic: options.onDiagnostic } : {}),
    })
    this.#reviewer = new ToolReviewClient({
      endpoint,
      apiKey: options.apiKey,
      orgSalt: options.orgSalt,
      defaultAgent: options.defaultAgent,
      declaredTools: Object.keys(baseConfig.tools),
      scrubber: this.#scrubber,
      ...(options.fetcher ? { fetcher: options.fetcher } : {}),
      ...(options.review ? { review: options.review } : {}),
      ...(options.onDiagnostic ? { onDiagnostic: options.onDiagnostic } : {}),
    })
    const autoFlushMs = options.observation?.autoFlushMs
    if (autoFlushMs !== undefined) {
      this.#autoFlush = setInterval(() => void this.flush().catch(() => undefined), autoFlushMs)
      // A background timer must not hold a short-lived process open.
      this.#autoFlush.unref?.()
    }
  }

  async config(options: {
    agent: string
    userId: string
    sessionId?: string
  }): Promise<AgentConfig> {
    return this.#resolver.resolve(options.agent, hashUserId(this.#options.orgSalt, options.userId))
  }

  /** Where the last resolution for this identity came from: remote, cache, or base. */
  configSource(options: { agent: string; userId: string }): ConfigSource | undefined {
    return this.#resolver.sourceOf(options.agent, hashUserId(this.#options.orgSalt, options.userId))
  }

  /** Drops cached configuration so an urgent rollout applies without a restart. */
  invalidateConfig(options?: { agent: string; userId: string }): void {
    if (options === undefined) {
      this.#resolver.clear()
      return
    }
    this.#resolver.invalidate(options.agent, hashUserId(this.#options.orgSalt, options.userId))
  }

  /** Queues a session for delivery. */
  observeSession(session: SessionObservationInput): void {
    try {
      this.#queue.push(structuredClone(session))
    } catch (cause) {
      report(this.#options.onDiagnostic, {
        stage: 'observe',
        code: 'INVALID_INPUT',
        message: 'A session could not be captured and was dropped.',
        cause,
      })
    }
  }

  observe(session: SessionObservationInput): void {
    this.observeSession(session)
  }

  async rules(userId: string): Promise<Rule[]> {
    const config = await this.config({ agent: this.#options.defaultAgent, userId })
    return structuredClone(config.rules)
  }

  reviewToolCall(input: ReviewToolCallInput) {
    return this.#reviewer.review(input)
  }

  reviewMcpToolCall(input: ReviewMcpToolCallInput) {
    return this.#reviewer.reviewMcp(input)
  }

  async flush(): Promise<void> {
    await this.#queue.flush()
  }

  observationStats(): ObservationQueueStats {
    return this.#queue.stats()
  }

  /** Stops the auto-flush timer and delivers whatever is still queued. */
  async close(): Promise<void> {
    if (this.#autoFlush !== undefined) {
      clearInterval(this.#autoFlush)
      this.#autoFlush = undefined
    }
    await this.flush()
  }

  async #send(item: unknown): Promise<void> {
    if (!item || typeof item !== 'object') return
    const payload = await prepareSession(item as SessionObservationInput, {
      orgId: this.#options.orgId,
      orgSalt: this.#options.orgSalt,
      defaultAgent: this.#options.defaultAgent,
      fields: this.#options.redact.fields,
      scrubber: this.#scrubber,
    })
    if (payload === null) {
      report(this.#options.onDiagnostic, {
        stage: 'observe',
        code: 'INVALID_INPUT',
        message: 'A session failed validation and was not sent.',
      })
      throw new SessionRejectedError('Invalid session observation')
    }
    const fetcher = this.#options.fetcher ?? fetch
    const url = new URL('v1/events', `${this.#options.endpoint}/`).toString()
    const response = await withTimeout(
      fetcher(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.#options.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.#observationTimeoutMs),
      }),
      this.#observationTimeoutMs,
      'Observation timed out',
    )
    if (!response.ok) {
      report(this.#options.onDiagnostic, {
        stage: 'observe',
        code: classifyStatus(response.status),
        message: `Event ingest returned ${String(response.status)}.`,
        detail: { status: response.status },
      })
      // A rejected payload will be rejected identically on every retry.
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw new SessionRejectedError(`Observation transport returned ${String(response.status)}`)
      }
      throw new Error(`Observation transport returned ${String(response.status)}`)
    }
  }
}

/** A session the server will never accept; retrying it only loses newer evidence. */
export class SessionRejectedError extends Error {
  override readonly name = 'SessionRejectedError'
}

export const Wingman = {
  init(options: InitOptions): WingmanClient {
    return new WingmanClient(options)
  },
}

/** @deprecated Use {@link Wingman}. */
export const Outcome = Wingman
/** @deprecated Use {@link WingmanClient}. */
export { WingmanClient as OutcomeClient }
export { createAgentReplayHandler } from './replay.js'
export { createToolMiddleware, toArgs } from './adapters.js'
export type { ToolReviewHost } from './adapters.js'
export { isMcpToolsCallRequest } from './review.js'
export type { ReplayDecision, ReplayInput } from './replay.js'
export { hashUserId } from './hash.js'
export { FileConfigStorage } from './storage.js'
export { DEFAULT_PII_CATEGORIES, LocalPiiScrubber } from './redaction.js'
export type { LocalPiiScrubberOptions, PiiCategory, PiiScrubber } from './redaction.js'
export type {
  DiagnosticCode,
  DiagnosticEvent,
  DiagnosticListener,
  DiagnosticStage,
} from './diagnostics.js'
export type { ConfigSource } from './resolve.js'
export type { AgentConfig, ToolCall, ToolCallReviewDecision } from '@wingman/schema'
export type {
  ConfigStorage,
  ObservationQueueStats,
  ReviewMcpToolCallInput,
  ReviewToolCallInput,
  SessionObservationInput,
  ToolReviewOptions,
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

const normalizeEndpoint = (value: string): string => {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`Wingman endpoint is not a valid URL: ${value}`)
  }
  if (url.protocol !== 'https:' && !LOCAL_HOSTS.has(url.hostname)) {
    throw new Error('Wingman endpoint must use HTTPS')
  }
  // A query string or fragment on the base endpoint silently corrupts every request path built from.
  if (url.search !== '') throw new Error('Wingman endpoint must not contain a query string')
  if (url.hash !== '') throw new Error('Wingman endpoint must not contain a fragment')
  return url.toString().replace(/\/$/, '')
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const validateOptions = (options: InitOptions): void => {
  for (const [name, value] of [
    ['apiKey', options.apiKey],
    ['orgId', options.orgId],
    ['orgSalt', options.orgSalt],
    ['signingKey', options.signingKey],
    ['defaultAgent', options.defaultAgent],
  ] as const) {
    if (value.trim().length === 0) throw new Error(`${name} is required`)
  }
  if (!UUID.test(options.orgId)) throw new Error('orgId must be a UUID')
  if (!UUID.test(options.defaultAgent)) throw new Error('defaultAgent must be a UUID')
  for (const [name, value] of [
    ['maxDiffBytes', options.maxDiffBytes],
    ['review.timeoutMs', options.review?.timeoutMs],
    ['config.timeoutMs', options.config?.timeoutMs],
    ['config.cacheTtlMs', options.config?.cacheTtlMs],
    ['config.maxCacheEntries', options.config?.maxCacheEntries],
    ['observation.capacity', options.observation?.capacity],
    ['observation.timeoutMs', options.observation?.timeoutMs],
    ['observation.concurrency', options.observation?.concurrency],
    ['observation.maxAttempts', options.observation?.maxAttempts],
    ['observation.autoFlushMs', options.observation?.autoFlushMs],
  ] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
      throw new Error(`${name} must be a positive finite number`)
    }
  }
  if (options.writable.some((path) => path.trim().length === 0)) {
    throw new Error('writable paths must not be empty')
  }
  if (options.redact.fields.some((field) => field.trim().length === 0)) {
    throw new Error('redaction fields must not be empty')
  }
}
