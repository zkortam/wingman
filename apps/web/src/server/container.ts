import { demoRuntime } from './demo-runtime'

export const reader = {
  listIncidents: () => Promise.resolve(demoRuntime.listIncidents()),
  getIncident: (id: string) => Promise.resolve(demoRuntime.incident(id)),
  listOutcomes: () => Promise.resolve(demoRuntime.listOutcomes()),
  silentFailureRate: () => Promise.resolve({ thisWeek: 4.2, lastWeek: 4.5 }),
}

export const commands = {
  apply: (id: string, scope: 'USER' | 'GLOBAL') => Promise.resolve(demoRuntime.apply(id, scope)),
  dismiss: (id: string, _reason: string) => Promise.resolve(demoRuntime.dismiss(id)),
  reopen: (id: string) => Promise.resolve(demoRuntime.reopen(id)),
  handoff: (id: string) => Promise.resolve({ payload: demoRuntime.incident(id)?.handoff ?? '' }),
}

export const config = {
  resolve: (agent: string, userHash: string) => Promise.resolve(demoRuntime.config(agent, userHash)),
  listVersions: () => Promise.resolve(demoRuntime.versions()),
  revert: (userHash: string) => Promise.resolve(demoRuntime.revert(userHash)),
}
