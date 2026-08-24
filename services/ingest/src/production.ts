import { createServiceClient } from '@wingman/db'
import type { EventName, EventPublisher, Events } from '@wingman/schema'
import { Inngest } from 'inngest'

import { createIngestService, type IngestService } from './service.js'
import { OpenAIEmbeddingClient } from './openai.js'
import { createSupabaseIngestStore } from './write.js'

export class InngestEventPublisher implements EventPublisher {
  readonly #client: Inngest

  constructor(eventKey: string) {
    if (!eventKey.trim()) throw new Error('INNGEST_EVENT_KEY is required')
    this.#client = new Inngest({ id: 'wingman-ingest', eventKey })
  }

  async publish<Name extends EventName>(name: Name, event: Events[Name], idempotencyKey: string): Promise<void> {
    await this.#client.send({ id: idempotencyKey, name, data: event.data })
  }
}

export const createProductionIngestService = (input: {
  openAiApiKey?: string
  inngestEventKey?: string
} = {}): IngestService => {
  const openAiApiKey = input.openAiApiKey ?? process.env.OPENAI_API_KEY ?? ''
  const inngestEventKey = input.inngestEventKey ?? process.env.INNGEST_EVENT_KEY ?? ''
  return createIngestService({
    store: createSupabaseIngestStore(createServiceClient()),
    embeddings: new OpenAIEmbeddingClient({ apiKey: openAiApiKey }),
    events: new InngestEventPublisher(inngestEventKey),
  })
}
