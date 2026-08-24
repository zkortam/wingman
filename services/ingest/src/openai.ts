import type { EmbeddingClient } from '@wingman/schema'

interface OpenAIEmbeddingOptions {
  apiKey: string
  fetcher?: typeof fetch
  model?: string
  timeoutMs?: number
}

export class OpenAIEmbeddingClient implements EmbeddingClient {
  readonly #options: OpenAIEmbeddingOptions

  constructor(options: OpenAIEmbeddingOptions) {
    if (!options.apiKey.trim()) throw new Error('OpenAI API key is required')
    this.#options = options
  }

  async embed(input: { texts: string[]; dimensions: 1536 }): Promise<number[][]> {
    if (input.texts.some((text) => text.length === 0)) throw new Error('Embedding inputs must be non-empty')
    if (input.texts.length === 0) return []
    const timeoutMs = this.#options.timeoutMs ?? 10_000
    const response = await withTimeout((this.#options.fetcher ?? fetch)('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.#options.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.#options.model ?? 'text-embedding-3-small',
        input: input.texts,
        dimensions: input.dimensions,
        encoding_format: 'float',
      }),
      signal: AbortSignal.timeout(timeoutMs),
    }), timeoutMs)
    if (!response.ok) throw new Error(`Embedding transport returned ${String(response.status)}`)
    const payload = await response.json()
    const data = payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: unknown[] }).data
      : []
    const ordered: number[][] = Array(input.texts.length)
    for (const item of data) {
      if (!item || typeof item !== 'object') throw new Error('Embedding response is invalid')
      const { index, embedding } = item as { index?: unknown; embedding?: unknown }
      if (!Number.isInteger(index) || !Array.isArray(embedding) || embedding.length !== input.dimensions || embedding.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
        throw new Error('Embedding response is invalid')
      }
      ordered[index as number] = embedding as number[]
    }
    if (ordered.some((vector) => vector === undefined)) throw new Error('Embedding response is invalid')
    return ordered
  }
}

async function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Embedding request timed out')), timeoutMs)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
