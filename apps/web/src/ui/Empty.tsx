import Link from 'next/link'

interface EmptyProps {
  fact: string
  action?: { href: string; label: string }
}

export const Empty = ({ fact, action }: EmptyProps) => (
  <div className="empty">
    <p>{fact}</p>
    {action ? <Link href={action.href}>{action.label}</Link> : null}
  </div>
)
