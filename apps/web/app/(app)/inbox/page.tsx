import Link from 'next/link'

import { LiveIncidentTable } from '../../../src/features/incidents/LiveIncidentTable'
import { reader } from '../../../src/server/container'
import { PageHeader } from '../../../src/ui/PageHeader'
import { Stat } from '../../../src/ui/Stat'

export default async function InboxPage() {
  const [incidents, rate] = await Promise.all([reader.listIncidents(), reader.silentFailureRate()])
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
