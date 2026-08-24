import { AgentConfigSchema, type AgentConfig, type Rule } from '@wingman/schema'

import { CONFIG_MAX_DIFF_BYTES, OBSERVATION_QUEUE_CAPACITY, OBSERVATION_TIMEOUT_MS } from './constants.js'
import { hashUserId } from './hash.js'
import { ObservationQueue, type ObservationQueueStats } from './observe.js'
import { LocalPiiScrubber, type PiiScrubber } from './openredaction.js'
import { ConfigResolver } from './resolve.js'
import {
  ToolReviewClient,
  type ReviewMcpToolCallInput,
  type ReviewToolCallInput,
  type ToolReviewOptions,
} from './review.js'
import { prepareSession, type SessionObservationInput } from './session.js'
import { FileConfigStorage, type ConfigStorage } from './storage.js'
import { withTimeout } from './timeout.js'

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
  config?: { timeoutMs?: number }
  review?: ToolReviewOptions
}

export class WingmanClient {
  readonly #options: InitOptions
  readonly #resolver: ConfigResolver
  readonly #queue: ObservationQueue
  readonly #scrubber: PiiScrubber
  readonly #reviewer: ToolReviewClient

  constructor(options: InitOptions) {
    validateOptions(options)
    const endpoint = normalizeEndpoint(options.endpoint)
    const baseConfig = AgentConfigSchema.parse(structuredClone(options.baseConfig))
    this.#options = {
      ...options,
      endpoint,
      baseConfig,
      writable: [...options.writable],
      redact: { fields: [...options.redact.fields] },
    }
    this.#scrubber = options.scrubber ?? new LocalPiiScrubber()
    this.#resolver = new ConfigResolver({
      endpoint,
      apiKey: options.apiKey,
      baseConfig,
      signingKey: options.signingKey,
      writablePaths: options.writable,
      maxDiffBytes: options.maxDiffBytes ?? CONFIG_MAX_DIFF_BYTES,
      ...(options.validate ? { validate: options.validate } : {}),
      ...(options.fetcher ? { fetcher: options.fetcher } : {}),
      storage: options.storage ?? new FileConfigStorage(),
      ...(options.config?.timeoutMs === undefined
        ? {}
        : { timeoutMs: options.config.timeoutMs }),
    })
    this.#queue = new ObservationQueue({ capacity: OBSERVATION_QUEUE_CAPACITY, send: (item) => this.#send(item) })
    this.#reviewer = new ToolReviewClient({
      endpoint,
      apiKey: options.apiKey,
      orgSalt: options.orgSalt,
      defaultAgent: options.defaultAgent,
      declaredTools: Object.keys(baseConfig.tools),
      scrubber: this.#scrubber,
      ...(options.fetcher ? { fetcher: options.fetcher } : {}),
      ...(options.review ? { review: options.review } : {}),
    })
  }

  async config(options: { agent: string; userId: string; sessionId?: string }): Promise<AgentConfig> {
    return this.#resolver.resolve(options.agent, hashUserId(this.#options.orgSalt, options.userId))
  }

  observeSession(session: SessionObservationInput): void {
    try {
      this.#queue.push(session)
    } catch {
      return
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

  async #send(item: unknown): Promise<void> {
    if (!item || typeof item !== 'object') return
    const payload = await prepareSession(item as SessionObservationInput, {
      orgId: this.#options.orgId,
      orgSalt: this.#options.orgSalt,
      defaultAgent: this.#options.defaultAgent,
      fields: this.#options.redact.fields,
      scrubber: this.#scrubber,
    })
    if (payload === null) throw new Error('Invalid session observation')
    const fetcher = this.#options.fetcher ?? fetch
    const response = await withTimeout(fetcher(`${this.#options.endpoint}/v1/events`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.#options.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(OBSERVATION_TIMEOUT_MS),
    }), OBSERVATION_TIMEOUT_MS, 'Observation timed out')
    if (!response.ok) throw new Error(`Observation transport returned ${String(response.status)}`)
  }
}

export const Wingman = {
  init(options: InitOptions): WingmanClient {
    return new WingmanClient(options)
  },
}

/** @deprecated Use Wingman. */
export const Outcome = Wingman
export { WingmanClient as OutcomeClient }
export { createAgentReplayHandler } from './replay.js'
export { createToolMiddleware } from './adapters.js'
export type { ToolReviewHost } from './adapters.js'
export { isMcpToolsCallRequest } from './review.js'
export type { ReplayDecision, ReplayInput } from './replay.js'
export { hashUserId } from './hash.js'
export { FileConfigStorage } from './storage.js'
export { LocalPiiScrubber } from './openredaction.js'
export type { PiiScrubber } from './openredaction.js'
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
  const url = new URL(value)
  if (url.protocol !== 'https:' && !LOCAL_HOSTS.has(url.hostname)) {
    throw new Error('Wingman endpoint must use HTTPS')
  }
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
