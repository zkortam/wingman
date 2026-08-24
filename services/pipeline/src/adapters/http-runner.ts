import {
  AgentReplayRequestSchema,
  AgentReplayResponseSchema,
  type AgentRunner,
} from '@wingman/schema'

export class HttpAgentRunner implements AgentRunner {
  readonly #endpoint: string
  readonly #token: string
  readonly #fetcher: typeof fetch
  readonly #timeoutMs: number

  constructor(options: {
    endpoint: string
    token: string
    fetcher?: typeof fetch
    timeoutMs?: number
  }) {
    const endpoint = new URL(options.endpoint)
    if (endpoint.protocol !== 'https:' && endpoint.hostname !== 'localhost' && endpoint.hostname !== '127.0.0.1') {
      throw new Error('Agent runner endpoint must use HTTPS')
    }
    if (!options.token.trim()) throw new Error('Agent runner bearer token is required')
    this.#endpoint = endpoint.toString()
    this.#token = options.token
    this.#fetcher = options.fetcher ?? fetch
    this.#timeoutMs = options.timeoutMs ?? 30_000
  }

  async runTurn(input: Parameters<AgentRunner['runTurn']>[0]) {
    if (input.intercept?.({ name: '__wingman_probe__', args: {} }) !== 'INTERCEPT') {
      throw new Error('Agent runner requires tool interception')
    }
    const response = await this.#fetcher(this.#endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.#token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(AgentReplayRequestSchema.parse({
        config: input.config,
        messages: input.messages,
        context: input.context,
        sample: input.sample,
        interceptToolCalls: true,
      })),
      signal: AbortSignal.timeout(this.#timeoutMs),
    })
    if (!response.ok) throw new Error(`Agent runner returned ${String(response.status)}`)
    return AgentReplayResponseSchema.parse(await response.json())
  }
}
