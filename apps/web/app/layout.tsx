import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { AppFrame } from '../src/features/navigation/AppFrame'
import '../src/ui/tokens.css'
import '../src/ui/base.css'
import '../src/ui/layout.css'
import '../src/ui/content.css'
import '../src/ui/incident.css'
import '../src/ui/overlays.css'
import '../src/ui/demo.css'

export const metadata: Metadata = {
  title: 'Outcome',
  description: 'Proof your agent actually worked for the user.',
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  )
}
