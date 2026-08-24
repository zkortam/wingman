export const ServiceUnavailable = ({ resource }: { resource: string }) => (
  <main className="empty" role="alert">
    <h1>{resource} unavailable</h1>
    <p>Wingman could not reach the production service. Nothing was changed.</p>
    <p className="muted">Check Settings and retry when the integration is healthy.</p>
  </main>
)
