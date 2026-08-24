import type { ModelClient } from '@wingman/schema'

export class ReplayModelClient implements ModelClient {
  private index = 0

  constructor(private readonly responses: unknown[]) {}

  generate(): Promise<unknown> {
    const response = this.responses[this.index]
    this.index += 1
    if (response instanceof Error) return Promise.reject(response)
    if (response === undefined) return Promise.reject(new Error('Replay model cassette exhausted'))
    return Promise.resolve(structuredClone(response))
  }
}
