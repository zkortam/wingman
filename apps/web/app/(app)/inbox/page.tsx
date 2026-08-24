import Link from 'next/link'

import { LiveIncidentTable } from '../../../src/features/incidents/LiveIncidentTable'
import { reader } from '../../../src/server/container'
import { PageHeader } from '../../../src/ui/PageHeader'
import { Stat } from '../../../src/ui/Stat'
import { ServiceUnavailable } from '../../../src/features/status/ServiceUnavailable'

export const dynamic = 'force-dynamic'

export default async function InboxPage() {
  let incidents: Awaited<ReturnType<typeof reader.listIncidents>>
  let rate: Awaited<ReturnType<typeof reader.silentFailureRate>>
  try {
    incidents = await reader.listIncidents()
    rate = await reader.silentFailureRate()
  } catch {
    return <ServiceUnavailable resource="Incidents" />
  }
  const delta = Math.abs(rate.thisWeek - rate.lastWeek).toFixed(1)
  return (
    <>
      <PageHeader title="Inbox" meta="Incidents ranked by affected users" />
      <Link aria-label="View sessions behind the silent failure rate" href="/inbox?evidence=sessions">
        <Stat delta={delta} direction={rate.thisWeek <= rate.lastWeek ? 'down' : 'up'} label="Silent failure rate" value={`${rate.thisWeek.toFixed(1)}%`} />
      </Link>
      <LiveIncidentTable initialIncidents={incidents} />
    </>
  )
}
