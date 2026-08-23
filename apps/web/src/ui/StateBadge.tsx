import type { IncidentState } from '../domain/incidents'

export const StateBadge = ({ state }: { state: IncidentState }) => (
  <span className="state-badge" data-state={state}>
    {state}
  </span>
)
