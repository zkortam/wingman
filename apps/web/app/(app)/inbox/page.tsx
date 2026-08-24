import Link from 'next/link'

import { LiveIncidentTable } from '../../../src/features/incidents/LiveIncidentTable'
import { reader } from '../../../src/server/container'
import { PageHeader } from '../../../src/ui/PageHeader'
import { Stat } from '../../../src/ui/Stat'
import { ServiceUnavailable } from '../../../src/features/status/ServiceUnavailable'

export const dynamic = 'force-dynamic'

export default async function InboxPage(props: { searchParams?: Promise<{ evidence?: string }> }) {
  let incidents: Awaited<ReturnType<typeof reader.listIncidents>>
  let rate: Awaited<ReturnType<typeof reader.silentFailureRate>>
  let precision: Awaited<ReturnType<typeof reader.gatePrecision>>
  try {
    incidents = await reader.listIncidents()
    rate = await reader.silentFailureRate()
    precision = await reader.gatePrecision()
  } catch {
    return <ServiceUnavailable resource="Incidents" />
  }
  const params = props.searchParams ? await props.searchParams : {}
  const delta = Math.abs(rate.thisWeek - rate.lastWeek).toFixed(1)
  const showEvidence = params.evidence === 'sessions'
  return (
    <>
      <PageHeader title="Inbox" meta="Incidents ranked by affected users" />
      <div className="stat-line">
        <Link
          aria-label="View sessions behind the silent failure rate"
          href="/inbox?evidence=sessions"
        >
          <Stat
            delta={delta}
            direction={rate.thisWeek <= rate.lastWeek ? 'down' : 'up'}
            label="Silent failure rate"
            value={`${rate.thisWeek.toFixed(1)}%`}
          />
        </Link>
        <Stat label="Gate precision" value={`${Math.round(precision.precision * 100)}%`} />
      </div>
      {showEvidence ? (
        <p className="muted">
          Sessions behind the rate: {incidents.reduce((sum, incident) => sum + incident.users, 0)}{' '}
          affected users across {incidents.length} incidents. Open a row for copied excerpts that
          outlive event retention.
        </p>
      ) : null}
      <LiveIncidentTable initialIncidents={incidents} />
    </>
  )
}
