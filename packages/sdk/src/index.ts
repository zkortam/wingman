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

interface InitOptions {
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
    const { request, ...review } = input
    return this.#reviewer.review({
      ...review,
      proposedCall: {
        name: request.params.name,
        args: request.params.arguments ?? {},
      },
    })
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
    }), OBSERVATION_TIMEOUT_MS)
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
export type { ReplayDecision, ReplayInput } from './replay.js'
export type {
  ConfigStorage,
  InitOptions,
  ObservationQueueStats,
  ReviewMcpToolCallInput,
  ReviewToolCallInput,
  SessionObservationInput,
  ToolReviewOptions,
}

const normalizeEndpoint = (value: string): string => {
  const url = new URL(value)
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error('Wingman endpoint must use HTTPS')
  }
  return url.toString().replace(/\/$/, '')
}

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

const withTimeout = async <T>(work: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Observation timed out')), timeoutMs)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
