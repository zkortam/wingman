import type { IncidentDetailView, IncidentSummaryView } from '../domain/incidents'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, init)
  if (!response.ok) throw new ApiError(response.status, `Request failed: ${response.status}`)
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const apiClient = {
  listIncidents: (): Promise<IncidentSummaryView[]> => request('/v1/incidents'),
  getIncident: (id: string): Promise<IncidentDetailView> =>
    request(`/v1/incidents/${encodeURIComponent(id)}`),
  apply: (
    id: string,
    scope: 'USER' | 'GLOBAL',
  ): Promise<{ outcomeId: string; versionId: string }> =>
    request(`/v1/incidents/${encodeURIComponent(id)}/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scope }),
    }),
  dismiss: (id: string, reason: string): Promise<void> =>
    request(`/v1/incidents/${encodeURIComponent(id)}/dismiss`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason }),
    }),
  reopen: (id: string): Promise<void> =>
    request(`/v1/incidents/${encodeURIComponent(id)}/reopen`, { method: 'POST' }),
  handoff: (id: string): Promise<{ payload: string }> =>
    request(`/v1/incidents/${encodeURIComponent(id)}/handoff`, { method: 'POST' }),
  listVersions: (
    agent: string,
  ): Promise<Array<{ id: string; version: number; incidentId: string | null }>> =>
    request(`/v1/config/${encodeURIComponent(agent)}/versions`),
  revert: (agent: string, userHash: string, incidentId?: string): Promise<void> =>
    request(`/v1/config/${encodeURIComponent(agent)}/revert`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userHash, incidentId }),
    }),
  resolveConfig: (
    agent: string,
    userHash: string,
  ): Promise<{ config: unknown; version: number; signature: string }> =>
    request(`/v1/config/${encodeURIComponent(agent)}/${encodeURIComponent(userHash)}`),
  confirm: (id: string): Promise<void> =>
    request(`/v1/incidents/${encodeURIComponent(id)}/confirm`, { method: 'POST' }),
  gatePrecision: (): Promise<{ precision: number; n: number }> => request('/v1/metrics/gate'),
}
