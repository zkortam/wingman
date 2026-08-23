import { createHash, createHmac, randomUUID } from 'node:crypto'
import { closeSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { demoIncident, demoIncidents, demoIncidentSummaries } from '../data/demo-incidents'
import { DEMO_REPORTER_HASH } from '../domain/demo'
import type { IncidentDetailView, IncidentState, IncidentSummaryView } from '../domain/incidents'

const baseConfig = {
  systemPrompt: "You are Ops Copilot, Ledgerline's RevOps assistant.",
  tools: [{ name: 'export_records', description: 'Exports records from the current object.' }],
  rules: [],
}
const fixedConfig = {
  ...baseConfig,
  tools: [{ name: 'export_records', description: "Exports records. Pass the caller's active view filters in filters so the export matches the visible view." }],
}

const normalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, normalize(nested)]))
}

interface IncidentRuntimeState {
  state: IncidentState
  stateReason: string | null
  scope: 'USER' | 'GLOBAL' | null
  confirmation: IncidentDetailView['confirmation'] | null
  appliedAt: string | null
  confirmedAt: string | null
}

interface RuntimeState {
  reporterVersion: number
  globalVersion: number
  incidents: Record<string, IncidentRuntimeState>
}

const initialState = (): RuntimeState => ({
  reporterVersion: 1,
  globalVersion: 1,
  incidents: Object.fromEntries(demoIncidents().map((incident) => [incident.id, {
    state: incident.state,
    stateReason: incident.stateReason ?? null,
    scope: incident.scope ?? null,
    confirmation: incident.confirmation ?? null,
    appliedAt: incident.appliedAt ?? null,
    confirmedAt: incident.confirmedAt ?? null,
  }])),
})

const stateNamespace = process.env.OUTCOME_DEMO_RUN_ID ?? (process.env.VITEST ? String(process.pid) : 'local')
const stateKey = createHash('sha256').update(`${process.cwd()}:${stateNamespace}`).digest('hex').slice(0, 16)
const statePath = join(tmpdir(), `outcome-demo-${stateKey}.json`)
const lockPath = `${statePath}.lock`

class DemoRuntime {
  constructor() {
    try {
      writeFileSync(statePath, JSON.stringify(initialState()), { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    } catch {
      return
    }
  }

  listIncidents(): IncidentSummaryView[] {
    const state = this.#read()
    return demoIncidentSummaries().map((summary) => ({ ...summary, state: state.incidents[summary.id]?.state ?? summary.state }))
  }

  listOutcomes(): IncidentDetailView[] {
    return demoIncidentSummaries().flatMap(({ id }) => {
      const incident = this.incident(id)
      return incident && ['APPLIED', 'CONFIRMED', 'REVERTED'].includes(incident.state) ? [incident] : []
    })
  }

  incident(id: string): IncidentDetailView | null {
    const incident = demoIncident(id)
    const runtime = this.#read().incidents[id]
    if (!incident || !runtime) return null
    const resolved = { ...incident, state: runtime.state }
    if (runtime.stateReason) resolved.stateReason = runtime.stateReason
    else delete resolved.stateReason
    if (runtime.scope) resolved.scope = runtime.scope
    else delete resolved.scope
    if (runtime.confirmation) resolved.confirmation = runtime.confirmation
    else delete resolved.confirmation
    if (runtime.appliedAt) resolved.appliedAt = runtime.appliedAt
    else delete resolved.appliedAt
    if (runtime.confirmedAt) resolved.confirmedAt = runtime.confirmedAt
    else delete resolved.confirmedAt
    return resolved
  }

  apply(id: string, scope: 'USER' | 'GLOBAL'): { outcomeId: string; versionId: string } {
    this.#mutate((state) => {
      const incident = state.incidents[id]
      if (!incident || incident.state !== 'CANDIDATE') throw new Error('Incident is not ready to apply')
      incident.state = 'APPLIED'
      incident.appliedAt = new Date().toISOString()
      incident.scope = scope
      incident.confirmation = { status: 'PENDING', detail: 'Confirmation window ends in 24h' }
      if (scope === 'USER') state.reporterVersion = 2
      else state.globalVersion = 2
    })
    return { outcomeId: randomUUID(), versionId: 'v2' }
  }

  dismiss(id: string): void {
    this.#mutate((state) => {
      const incident = state.incidents[id]
      if (!incident) throw new Error('Unknown incident')
      incident.state = 'DISCARDED'
      incident.stateReason = 'Dismissed by operator'
    })
  }

  reopen(id: string): void {
    this.#mutate((state) => {
      const incident = state.incidents[id]
      if (!incident) throw new Error('Unknown incident')
      incident.state = 'CANDIDATE'
      incident.stateReason = null
      incident.confirmation = null
      incident.appliedAt = null
      incident.confirmedAt = null
    })
  }

  config(agent: string, userHash: string): { config: unknown; version: number; signature: string } {
    const state = this.#read()
    const version = state.globalVersion === 2 ? 2 : userHash === DEMO_REPORTER_HASH ? state.reporterVersion : 1
    const config = version === 2 ? fixedConfig : baseConfig
    const canonical = JSON.stringify(normalize(config))
    const signature = createHmac('sha256', 'demo-signing-key').update(`${agent}.${String(version)}.${canonical}`).digest('hex')
    return { config, version, signature }
  }

  versions(): Array<{ id: string; version: number; incidentId: string | null }> {
    return [
      { id: 'v1', version: 1, incidentId: null },
      { id: 'v2', version: 2, incidentId: 'OC-1042' },
    ]
  }

  revert(userHash: string): void {
    if (userHash !== DEMO_REPORTER_HASH) throw new Error('Unknown override')
    this.#mutate((state) => {
      state.reporterVersion = 1
      state.globalVersion = 1
      const incident = state.incidents['OC-1042']
      if (incident?.state === 'APPLIED' || incident?.state === 'CONFIRMED') incident.state = 'REVERTED'
    })
  }

  reset(): void {
    this.#mutate((state) => Object.assign(state, initialState()))
  }

  #read(): RuntimeState {
    try {
      return JSON.parse(readFileSync(statePath, 'utf8')) as RuntimeState
    } catch {
      return initialState()
    }
  }

  #mutate(change: (state: RuntimeState) => void): void {
    const lock = openSync(lockPath, 'wx', 0o600)
    try {
      const state = this.#read()
      change(state)
      const temporary = `${statePath}.${String(process.pid)}.${randomUUID()}.tmp`
      writeFileSync(temporary, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 })
      renameSync(temporary, statePath)
    } finally {
      closeSync(lock)
      unlinkSync(lockPath)
    }
  }
}

export const demoRuntime = new DemoRuntime()
