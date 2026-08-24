interface QueueOptions {
  capacity: number
  concurrency?: number
  send: (item: unknown) => Promise<void>
}

export interface ObservationQueueStats {
  queued: number
  dropped: number
  sent: number
  failed: number
}

export class ObservationQueue {
  readonly #capacity: number
  readonly #send: (item: unknown) => Promise<void>
  readonly #concurrency: number
  readonly #items: unknown[] = []
  #flushing: Promise<void> | null = null
  #dropped = 0
  #sent = 0
  #failed = 0

  constructor(options: QueueOptions) {
    if (!Number.isInteger(options.capacity) || options.capacity < 1) throw new Error('Queue capacity must be a positive integer')
    const concurrency = options.concurrency ?? 4
    if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('Queue concurrency must be a positive integer')
    this.#capacity = options.capacity
    this.#concurrency = concurrency
    this.#send = options.send
  }

  push(item: unknown): void {
    if (this.#items.length === this.#capacity) {
      this.#items.shift()
      this.#dropped += 1
    }
    this.#items.push(item)
  }

  stats(): ObservationQueueStats {
    return {
      queued: this.#items.length,
      dropped: this.#dropped,
      sent: this.#sent,
      failed: this.#failed,
    }
  }

  async flush(): Promise<void> {
    if (this.#flushing) return this.#flushing
    this.#flushing = this.#drain()
    await this.#flushing
    this.#flushing = null
  }

  async #drain(): Promise<void> {
    while (this.#items.length > 0) {
      const batch = this.#items.splice(0)
      let next = 0
      const worker = async (): Promise<void> => {
        while (next < batch.length) {
          const item = batch[next]
          next += 1
          if (item === undefined) continue
          try {
            await this.#send(item)
            this.#sent += 1
          } catch {
            this.#failed += 1
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(this.#concurrency, batch.length) }, worker))
    }
  }
}
