import type { AgentConfig, Rule, SessionInput } from '@outcome/schema'

import { CONFIG_MAX_DIFF_BYTES, OBSERVATION_QUEUE_CAPACITY } from './constants'
import { hashUserId } from './hash'
import { ObservationQueue } from './observe'
import { LocalPiiScrubber, type PiiScrubber } from './openredaction'
import { redactObservation } from './redact'
import { ConfigResolver } from './resolve'
import { FileConfigStorage, type ConfigStorage } from './storage'

interface InitOptions {
  endpoint: string
  apiKey: string
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
}

export class OutcomeClient {
  readonly #options: InitOptions
  readonly #resolver: ConfigResolver
  readonly #queue: ObservationQueue
  readonly #scrubber: PiiScrubber

  constructor(options: InitOptions) {
    this.#options = options
    this.#scrubber = options.scrubber ?? new LocalPiiScrubber()
    this.#resolver = new ConfigResolver({
      endpoint: options.endpoint,
      apiKey: options.apiKey,
      baseConfig: options.baseConfig,
      signingKey: options.signingKey,
      writablePaths: options.writable,
      maxDiffBytes: options.maxDiffBytes ?? CONFIG_MAX_DIFF_BYTES,
      ...(options.validate ? { validate: options.validate } : {}),
      ...(options.fetcher ? { fetcher: options.fetcher } : {}),
      storage: options.storage ?? new FileConfigStorage(),
    })
    this.#queue = new ObservationQueue({ capacity: OBSERVATION_QUEUE_CAPACITY, send: (item) => this.#send(item) })
  }

  async config(options: { agent: string; userId: string; sessionId?: string }): Promise<AgentConfig> {
    return this.#resolver.resolve(options.agent, hashUserId(this.#options.orgSalt, options.userId))
  }

  observe(session: SessionInput): void {
    try {
      this.#queue.push(session)
    } catch {
      return
    }
  }

  async rules(userId: string): Promise<Rule[]> {
    const config = await this.config({ agent: this.#options.defaultAgent, userId })
    return structuredClone(((config as unknown as { rules?: Rule[] }).rules) ?? [])
  }

  async flush(): Promise<void> {
    await this.#queue.flush()
  }

  async #send(item: unknown): Promise<void> {
    if (!item || typeof item !== 'object') return
    const userId = (item as { userId?: unknown }).userId
    if (typeof userId !== 'string') return
    const payload = await redactObservation(item, {
      userHash: hashUserId(this.#options.orgSalt, userId),
      fields: this.#options.redact.fields,
      scrub: (value) => this.#scrubber.scrub(value),
    })
    const fetcher = this.#options.fetcher ?? fetch
    await fetcher(`${this.#options.endpoint}/v1/events`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.#options.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }
}

export const Outcome = {
  init(options: InitOptions): OutcomeClient {
    return new OutcomeClient(options)
  },
}

export type { ConfigStorage, InitOptions }
