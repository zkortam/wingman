'use client'

export default function OperatorError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="empty" role="alert">
      <h1>Wingman is temporarily unavailable</h1>
      <p>Your operation was not applied. Check the service connection and try again.</p>
      <button onClick={reset} type="button">Retry</button>
    </main>
  )
}
