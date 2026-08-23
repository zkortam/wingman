interface QueueOptions {
  capacity: number
  send: (item: unknown) => Promise<void>
}

export class ObservationQueue {
  readonly #capacity: number
  readonly #send: (item: unknown) => Promise<void>
  readonly #items: unknown[] = []
  #flushing: Promise<void> | null = null

  constructor(options: QueueOptions) {
    this.#capacity = options.capacity
    this.#send = options.send
  }

  push(item: unknown): void {
    if (this.#items.length === this.#capacity) this.#items.shift()
    this.#items.push(item)
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
      await Promise.allSettled(batch.map((item) => this.#send(item)))
    }
  }
}
