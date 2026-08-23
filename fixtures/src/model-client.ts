import type { ModelClient } from '@outcome/schema'

import { CassetteStore } from './cassette'

interface ModelRequest {
  model: string
  messages: unknown[]
  tools?: unknown[]
  sample?: number
}

interface CassetteModelClientOptions {
  store: CassetteStore
  record: (request: ModelRequest) => Promise<unknown>
}

export class CassetteModelClient implements ModelClient {
  readonly #store: CassetteStore
  readonly #record: (request: ModelRequest) => Promise<unknown>

  constructor(options: CassetteModelClientOptions) {
    this.#store = options.store
    this.#record = options.record
  }

  async generate(request: ModelRequest): Promise<unknown> {
    return this.#store.response(request, request.sample ?? 0, () => this.#record(request))
  }

  async preflight(requests: ModelRequest[]): Promise<void> {
    await this.#store.preflight(requests)
  }
}
