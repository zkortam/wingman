import { SupabaseConfigStore } from '@wingman/config'
import {
  createProductionPipelineControlPlane,
  OpenAIModelClient,
  reviewProposedToolCall,
} from '@wingman/pipeline'
import { canonicalJSON } from '@wingman/schema'
import type { ToolCallReviewRequest } from '@wingman/schema'

import { demoRuntime } from './demo-runtime'
import { operatorIdentity } from './operator-identity'
import { presentIncident, presentIncidentSummary } from './presentation'

const demo = () => {
  if (process.env.WINGMAN_RUNTIME === 'demo') return demoRuntime
  throw new Error('Demo runtime is disabled')
}

let productionControl: ReturnType<typeof createProductionPipelineControlPlane> | undefined
const control = () => {
  productionControl ??= createProductionPipelineControlPlane()
  return productionControl
}

let productionConfig: SupabaseConfigStore | undefined
const configRuntime = (): SupabaseConfigStore => {
  productionConfig ??= new SupabaseConfigStore({ fallbackConfigs: new Map(), canonicalize: canonicalJSON })
  return productionConfig
}

export const reader = {
  listIncidents: async () => process.env.WINGMAN_RUNTIME === 'demo'
    ? demo().listIncidents()
    : (await control().reader.listIncidents(operatorIdentity().orgId)).map(presentIncidentSummary),
  getIncident: async (id: string) => process.env.WINGMAN_RUNTIME === 'demo'
    ? demo().incident(id)
    : presentIncident(await control().reader.getIncident(id)),
  listOutcomes: async () => {
    if (process.env.WINGMAN_RUNTIME === 'demo') return demo().listOutcomes()
    const summaries = await control().reader.listIncidents(operatorIdentity().orgId)
    const incidents = await Promise.all(summaries.map(({ id }) => control().reader.getIncident(id)))
    return incidents.filter(({ outcome }) => outcome !== null).map(presentIncident)
  },
  silentFailureRate: () => process.env.WINGMAN_RUNTIME === 'demo'
    ? Promise.resolve({ thisWeek: 4.2, lastWeek: 4.5 })
    : control().reader.silentFailureRate(operatorIdentity().orgId),
}

export const commands = {
  apply: (id: string, scope: 'USER' | 'GLOBAL') => process.env.WINGMAN_RUNTIME === 'demo'
    ? Promise.resolve(demo().apply(id, scope))
    : control().commands.apply(id, scope),
  dismiss: (id: string, reason: string) => process.env.WINGMAN_RUNTIME === 'demo'
    ? Promise.resolve(demo().dismiss(id))
    : control().commands.dismiss(id, reason),
  reopen: (id: string) => process.env.WINGMAN_RUNTIME === 'demo'
    ? Promise.resolve(demo().reopen(id))
    : control().commands.reopen(id),
  handoff: async (id: string) => process.env.WINGMAN_RUNTIME === 'demo'
    ? { payload: demo().incident(id)?.handoff ?? '' }
    : { payload: JSON.stringify(await control().commands.handoff(id), null, 2) },
  revert: (id: string, _agent: string, userHash: string) => process.env.WINGMAN_RUNTIME === 'demo'
    ? Promise.resolve(demo().revert(userHash))
    : control().revert(id),
}

export const config = {
  resolve: (agent: string, userHash: string) => process.env.WINGMAN_RUNTIME === 'demo'
    ? Promise.resolve(demo().config(agent, userHash))
    : configRuntime().resolveSigned(agent, userHash),
  listVersions: (agent: string) => process.env.WINGMAN_RUNTIME === 'demo'
    ? Promise.resolve(demo().versions())
    : configRuntime().listVersions(agent),
  revert: (agent: string, userHash: string) => process.env.WINGMAN_RUNTIME === 'demo'
    ? Promise.resolve(demo().revert(userHash))
    : configRuntime().revertOverride(agent, userHash),
}

let productionModel: OpenAIModelClient | undefined
export const reviews = {
  review: async (request: ToolCallReviewRequest) => {
    if (process.env.WINGMAN_RUNTIME === 'demo') {
      return { action: 'ALLOW' as const, reason: 'Demo review accepted the configured call.', instruction: null, confidence: 1, source: 'POLICY' as const }
    }
    productionModel ??= new OpenAIModelClient(process.env.OPENAI_API_KEY ?? '')
    const resolved = await configRuntime().resolve(request.agentId, request.userHash)
    return reviewProposedToolCall({ model: productionModel, config: resolved, request })
  },
}
