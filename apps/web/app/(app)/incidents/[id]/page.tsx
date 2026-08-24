import { notFound } from 'next/navigation'

import { IncidentProof } from '../../../../src/features/incidents/IncidentProof'
import { reader } from '../../../../src/server/container'
import { operatorIdentity } from '../../../../src/server/operator-identity'
import { ServiceUnavailable } from '../../../../src/features/status/ServiceUnavailable'

export const dynamic = 'force-dynamic'

export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let incident: Awaited<ReturnType<typeof reader.getIncident>>
  let incidents: Awaited<ReturnType<typeof reader.listIncidents>>
  let identity: ReturnType<typeof operatorIdentity>
  try {
    incident = await reader.getIncident(id)
    incidents = await reader.listIncidents()
    identity = operatorIdentity()
  } catch {
    return <ServiceUnavailable resource="Incident" />
  }
  if (!incident) notFound()
  const index = incidents.findIndex((item) => item.id === id)
  return (
    <IncidentProof
      {...identity}
      initialIncident={incident}
      nextId={incidents[index + 1]?.id}
      previousId={incidents[index - 1]?.id}
    />
  )
}
