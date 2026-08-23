'use client'

export default function InboxError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="empty" role="alert">
      <p>Could not load incidents.</p>
      <button onClick={reset} type="button">Retry</button>
    </div>
  )
}
