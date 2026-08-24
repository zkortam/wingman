import { SupabaseConfigStore } from '@wingman/config'
import { createServiceClient } from '@wingman/db'
import { createProductionIngestService, InngestEventPublisher } from '@wingman/ingest'
import { canonicalJSON, type AgentConfig, type EventName, type EventPublisher, type Events } from '@wingman/schema'

import { createPipelineCommands } from './commands.js'
import { revertAppliedOutcome } from './confirmation.js'
import { createPipelineEngine } from './engine.js'
import { CodexFixAgent } from './fix/agent.js'
import type { AppServerClient } from './fix/app-server.js'
import { WebSocketAppServerClient } from './fix/app-server.js'
import { NoopLedger } from './ledger/index.js'
import { createPipelineReader } from './reader.js'
import { createSupabasePipelineRepository } from './store/index.js'
import { OpenAIModelClient } from './adapters/openai.js'
import { HttpAgentRunner } from './adapters/http-runner.js'
import { createPipelineFunctions } from './functions/index.js'

export const createProductionPipelineControlPlane = (input: {
  fallbackConfigs?: ReadonlyMap<string, AgentConfig>
  inngestEventKey?: string
  appServerEndpoint?: string
  appServerToken?: string
} = {}) => {
  const repository = createSupabasePipelineRepository(createServiceClient())
  const configStore = new SupabaseConfigStore({
    fallbackConfigs: input.fallbackConfigs ?? new Map(),
    canonicalize: canonicalJSON,
  })
  const events = lazyEvents(input.inngestEventKey ?? process.env.INNGEST_EVENT_KEY ?? '')
  const appServer = lazyAppServer(
    input.appServerEndpoint ?? process.env.CODEX_APP_SERVER_ENDPOINT ?? '',
    input.appServerToken ?? process.env.CODEX_APP_SERVER_TOKEN ?? '',
  )
  const ledger = new NoopLedger()
  return {
    reader: createPipelineReader(repository),
    commands: createPipelineCommands({
      repository,
      configStore,
      events,
      ledger,
      appServer,
    }),
    revert: (incidentId: string) => revertAppliedOutcome({
      repository,
      configStore,
      ledger,
      incidentId,
    }),
  }
}

export const createProductionPipelineFunctions = (input: {
  fallbackConfigs?: ReadonlyMap<string, AgentConfig>
  openAiApiKey?: string
  inngestEventKey?: string
  runnerEndpoint?: string
  runnerToken?: string
  appServerEndpoint?: string
  appServerToken?: string
} = {}) => {
  const runnerEndpoint = required(
    input.runnerEndpoint ?? process.env.WINGMAN_RUNNER_ENDPOINT,
    'WINGMAN_RUNNER_ENDPOINT',
  )
  const runnerToken = required(
    input.runnerToken ?? process.env.WINGMAN_RUNNER_TOKEN,
    'WINGMAN_RUNNER_TOKEN',
  )
  const openAiApiKey = required(
    input.openAiApiKey ?? process.env.OPENAI_API_KEY,
    'OPENAI_API_KEY',
  )
  const eventKey = input.inngestEventKey ?? process.env.INNGEST_EVENT_KEY ?? ''
  const repository = createSupabasePipelineRepository(createServiceClient())
  const configStore = new SupabaseConfigStore({
    fallbackConfigs: input.fallbackConfigs ?? new Map(),
    canonicalize: canonicalJSON,
  })
  const events = lazyEvents(eventKey)
  const appServer = lazyAppServer(
    input.appServerEndpoint ?? process.env.CODEX_APP_SERVER_ENDPOINT ?? '',
    input.appServerToken ?? process.env.CODEX_APP_SERVER_TOKEN ?? '',
  )
  const ledger = new NoopLedger()
  const commands = createPipelineCommands({ repository, configStore, events, ledger, appServer })
  const engine = createPipelineEngine({
    repository,
    ingest: createProductionIngestService({ openAiApiKey, inngestEventKey: eventKey }),
    runner: new HttpAgentRunner({ endpoint: runnerEndpoint, token: runnerToken }),
    configStore,
    model: new OpenAIModelClient(openAiApiKey),
    fixAgent: new CodexFixAgent(),
    appServer,
    ledger,
    events,
  })
  return createPipelineFunctions({ engine, commands, repository })
}

const lazyEvents = (eventKey: string): EventPublisher => ({
  publish<Name extends EventName>(name: Name, event: Events[Name], idempotencyKey: string) {
    return new InngestEventPublisher(eventKey).publish(name, event, idempotencyKey)
  },
})

const lazyAppServer = (endpoint: string, token: string): AppServerClient => ({
  handoff(payload) {
    return new WebSocketAppServerClient(endpoint, token).handoff(payload)
  },
  writeAgentsMd(request) {
    return new WebSocketAppServerClient(endpoint, token).writeAgentsMd(request)
  },
})

const required = (value: string | undefined, name: string): string => {
  if (!value?.trim()) throw new Error(`${name} is required`)
  return value
}
