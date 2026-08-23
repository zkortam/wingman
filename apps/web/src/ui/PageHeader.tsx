import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: ReactNode
  meta?: ReactNode
  actions?: ReactNode
}

export const PageHeader = ({ title, meta, actions }: PageHeaderProps) => (
  <header className="page-header">
    <div>
      <h1>{title}</h1>
      {meta ? <div className="page-header-meta">{meta}</div> : null}
    </div>
    {actions ? <div className="page-actions">{actions}</div> : null}
  </header>
)
