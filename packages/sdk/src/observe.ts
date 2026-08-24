import { report, type DiagnosticListener } from './diagnostics.js'

interface QueueOptions {
  capacity: number
  concurrency?: number
  maxAttempts?: number
  send: (item: unknown) => Promise<void>
  onDiagnostic?: DiagnosticListener
  /** Injectable so retry backoff is testable without real time. */
  delay?: (ms: number) => Promise<void>
}

export interface ObservationQueueStats {
  queued: number
  dropped: number
  sent: number
  failed: number
  /** Sessions currently waiting for a further delivery attempt. */
  retrying: number
}

interface Entry {
  item: unknown
  attempts: number
}

/** Retrying a permanently rejected payload only crowds out newer evidence. */
const permanent = (error: unknown): boolean =>
  error instanceof Error && error.name === 'SessionRejectedError'

export class ObservationQueue {
  readonly #capacity: number
  readonly #send: (item: unknown) => Promise<void>
  readonly #concurrency: number
  readonly #maxAttempts: number
  readonly #onDiagnostic: DiagnosticListener | undefined
  readonly #delay: (ms: number) => Promise<void>
  readonly #items: Entry[] = []
  #flushing: Promise<void> | null = null
  #dropped = 0
  #sent = 0
  #failed = 0

  constructor(options: QueueOptions) {
    if (!Number.isInteger(options.capacity) || options.capacity < 1) {
      throw new Error('Queue capacity must be a positive integer')
    }
    const concurrency = options.concurrency ?? 4
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error('Queue concurrency must be a positive integer')
    }
    const maxAttempts = options.maxAttempts ?? 3
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new Error('Queue maxAttempts must be a positive integer')
    }
    this.#capacity = options.capacity
    this.#concurrency = concurrency
    this.#maxAttempts = maxAttempts
    this.#send = options.send
    this.#onDiagnostic = options.onDiagnostic
    this.#delay = options.delay ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  }

  push(item: unknown): void {
    if (this.#items.length >= this.#capacity) {
      this.#items.shift()
      this.#dropped += 1
      report(this.#onDiagnostic, {
        stage: 'observe',
        code: 'EVIDENCE_DROPPED',
        message: `The observation queue is full at ${String(this.#capacity)}; the oldest session was dropped.`,
        detail: { capacity: this.#capacity, dropped: this.#dropped },
      })
    }
    this.#items.push({ item, attempts: 0 })
  }

  stats(): ObservationQueueStats {
    return {
      queued: this.#items.length,
      dropped: this.#dropped,
      sent: this.#sent,
      failed: this.#failed,
      retrying: this.#items.filter((entry) => entry.attempts > 0).length,
    }
  }

  async flush(): Promise<void> {
    if (this.#flushing) return this.#flushing
    const flushing = this.#drain()
    this.#flushing = flushing
    try {
      await flushing
    } finally {
      if (this.#flushing === flushing) this.#flushing = null
    }
  }

  async #drain(): Promise<void> {
    // Sessions pushed while a flush is running are delivered by that same flush, so a host that.
    while (this.#items.length > 0) {
      const batch = this.#items.splice(0)
      const retry: Entry[] = []
      let next = 0
      const worker = async (): Promise<void> => {
        while (next < batch.length) {
          const entry = batch[next]
          next += 1
          if (entry === undefined) continue
          entry.attempts += 1
          try {
            await this.#send(entry.item)
            this.#sent += 1
          } catch (cause) {
            if (!permanent(cause) && entry.attempts < this.#maxAttempts) {
              retry.push(entry)
              continue
            }
            this.#failed += 1
            report(this.#onDiagnostic, {
              stage: 'observe',
              code: 'EVIDENCE_DROPPED',
              message: `A session was discarded after ${String(entry.attempts)} delivery attempt(s).`,
              cause,
              detail: { attempts: entry.attempts, permanent: permanent(cause) },
            })
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(this.#concurrency, batch.length) }, worker))
      if (retry.length > 0) {
        // Exponential backoff on the highest attempt count seen this round.
        const attempts = Math.max(...retry.map((entry) => entry.attempts))
        await this.#delay(Math.min(2 ** (attempts - 1) * 100, 2_000))
        this.#items.unshift(...retry)
      }
    }
  }
}
