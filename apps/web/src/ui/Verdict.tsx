import type { IncidentDetailView } from '../domain/incidents'

type VerdictModel = NonNullable<IncidentDetailView['verdict']>

export const Verdict = ({ verdict }: { verdict: VerdictModel }) => (
  <div>
    <div className="verdict-heading">
      {verdict.kind} | {verdict.confidence.toFixed(2)}
    </div>
    <ol className="verdict-list">
      {verdict.evidence.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ol>
  </div>
)
