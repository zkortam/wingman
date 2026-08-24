import type { EvidenceSessionView } from '../domain/incidents'

export const Evidence = ({
  sessions,
  expanded = false,
}: {
  sessions: EvidenceSessionView[]
  expanded?: boolean
}) => (
  <div>
    <div className="evidence-list">
      {sessions.map((session) => (
        <article className="evidence-session" key={session.id}>
          <div className="evidence-meta">
            {session.signal} | {session.confidence.toFixed(2)} | baseline{' '}
            {session.baseline.toFixed(2)} | {session.id}
          </div>
          {(expanded ? session.turns : session.turns.slice(-2)).map((turn, index) => (
            <div
              className="transcript-line"
              data-signaled={turn.signaled || undefined}
              key={`${session.id}-${index}`}
            >
              <span className="transcript-role">{turn.role}</span>
              <span>{turn.text}</span>
            </div>
          ))}
        </article>
      ))}
    </div>
    <p className="refusal-copy">Redacted in the customer&apos;s process before transmission.</p>
  </div>
)
