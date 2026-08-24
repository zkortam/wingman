import { notFound } from 'next/navigation'

import { DemoHarness } from '../../src/features/demo/DemoHarness'

export default function DemoPage() {
  if (process.env.WINGMAN_RUNTIME !== 'demo') notFound()
  return <DemoHarness />
}
