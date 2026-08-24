import { SupabaseConfigStore } from '@wingman/config'
import {
  createProductionPipelineControlPlane,
  OpenAIModelClient,
  reviewProposedToolCall,
} from '@wingman/pipeline'
import { AgentConfigSchema, canonicalJSON } from '@wingman/schema'
import type { AgentConfig, ToolCallReviewRequest } from '@wingman/schema'

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
const compiledFallbacks = (): Map<string, AgentConfig> => {
  const raw = process.env.WINGMAN_BASE_CONFIG?.trim()
  if (!raw) return new Map()
  try {
    return new Map([['*', AgentConfigSchema.parse(JSON.parse(raw) as unknown)]])
  } catch {
    return new Map()
  }
}

const configRuntime = (): SupabaseConfigStore => {
  productionConfig ??= new SupabaseConfigStore({ fallbackConfigs: compiledFallbacks(), canonicalize: canonicalJSON })
  return productionConfig
}

const inOrg = async (id: string): Promise<void> => {
  const listed = await control().reader.listIncidents(operatorIdentity().orgId)
  if (!listed.some((incident) => incident.id === id)) throw new Error('Incident not found')
}

export const reader = {
  listIncidents: async () => process.env.WINGMAN_RUNTIME === 'demo'
    ? demo().listIncidents()
    : (await control().reader.listIncidents(operatorIdentity().orgId)).map(presentIncidentSummary),
  getIncident: async (id: string) => {
    if (process.env.WINGMAN_RUNTIME === 'demo') return demo().incident(id)
    await inOrg(id)
    return presentIncident(await control().reader.getIncident(id))
  },
  listOutcomes: async () => {
    if (process.env.WINGMAN_RUNTIME === 'demo') return demo().listOutcomes()
    const outcomes = await control().reader.listOutcomes(operatorIdentity().orgId)
    const details = await Promise.all(
      outcomes.map((outcome) => control().reader.getIncident(outcome.incidentId)),
    )
    return details.map(presentIncident)
  },
  silentFailureRate: () => process.env.WINGMAN_RUNTIME === 'demo'
    ? Promise.resolve({ thisWeek: 4.2, lastWeek: 4.5 })
    : control().reader.silentFailureRate(operatorIdentity().orgId),
  gatePrecision: () => process.env.WINGMAN_RUNTIME === 'demo'
    ? Promise.resolve({ precision: 1, n: 6 })
    : control().reader.gatePrecision(operatorIdentity().orgId),
}

export const commands = {
  apply: async (id: string, scope: 'USER' | 'GLOBAL') => {
    if (process.env.WINGMAN_RUNTIME === 'demo') return demo().apply(id, scope)
    await inOrg(id)
    return control().commands.apply(id, scope)
  },
  dismiss: async (id: string, reason: string) => {
    if (process.env.WINGMAN_RUNTIME === 'demo') return demo().dismiss(id)
    await inOrg(id)
    return control().commands.dismiss(id, reason)
  },
  reopen: async (id: string) => {
    if (process.env.WINGMAN_RUNTIME === 'demo') return demo().reopen(id)
    await inOrg(id)
    return control().commands.reopen(id)
  },
  handoff: async (id: string) => {
    if (process.env.WINGMAN_RUNTIME === 'demo') return { payload: demo().incident(id)?.handoff ?? '' }
    await inOrg(id)
    return { payload: JSON.stringify(await control().commands.handoff(id), null, 2) }
  },
  revert: async (id: string, _agent: string, userHash: string) => {
    if (process.env.WINGMAN_RUNTIME === 'demo') return demo().revert(userHash)
    await inOrg(id)
    return control().revert(id)
  },
  confirm: async (id: string) => {
    if (process.env.WINGMAN_RUNTIME === 'demo') return demo().confirm(id)
    await inOrg(id)
    return control().commands.evaluateConfirmation(id)
  },
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
  review: async (request: ToolCallReviewRequest, failMode: 'open' | 'closed' = 'open') => {
    if (process.env.WINGMAN_RUNTIME === 'demo') {
      const resolved = demo().config(request.agentId, request.userHash)
      const tools = (resolved.config as { tools?: Record<string, unknown> }).tools ?? {}
      if (!Object.hasOwn(tools, request.proposedCall.name)) {
        return {
          action: 'ESCALATE' as const,
          reason: 'The proposed tool is absent from the agent configuration.',
          instruction: 'Do not execute this call until the tool is explicitly configured.',
          confidence: 1,
          source: 'POLICY' as const,
        }
      }
      return { action: 'ALLOW' as const, reason: 'Demo review accepted the configured call.', instruction: null, confidence: 1, source: 'POLICY' as const }
    }
    productionModel ??= new OpenAIModelClient(process.env.OPENAI_API_KEY ?? '')
    const resolved = await configRuntime().resolve(request.agentId, request.userHash)
    return reviewProposedToolCall({ model: productionModel, config: resolved, request, failMode })
  },
}
