import { notFound } from 'next/navigation'

import { IncidentProof } from '../../../../src/features/incidents/IncidentProof'
import { reader } from '../../../../src/server/container'

export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [incident, incidents] = await Promise.all([reader.getIncident(id), reader.listIncidents()])
  if (!incident) notFound()
  const index = incidents.findIndex((item) => item.id === id)
  return <IncidentProof
    initialIncident={incident}
    nextId={incidents[index + 1]?.id}
    previousId={incidents[index - 1]?.id}
  />
}
