'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

import { Rail } from '../../ui/Rail'

export const AppFrame = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname()
  if (pathname === '/demo') return children
  return (
    <>
      <div className="desktop-guard">Wingman is built for a desktop window.</div>
      <div className="app-shell">
        <Rail />
        <main className="main-content">{children}</main>
      </div>
    </>
  )
}
