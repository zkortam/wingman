'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { formatRelativeDate, type IncidentSummaryView } from '../domain/incidents'
import { StateBadge } from './StateBadge'

export const IncidentTable = ({ incidents }: { incidents: IncidentSummaryView[] }) => {
  const router = useRouter()
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    const listener = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.key === 'j') setSelected((value) => Math.min(value + 1, incidents.length - 1))
      if (event.key === 'k') setSelected((value) => Math.max(value - 1, 0))
      if (event.key === 'Enter') {
        const incident = incidents[selected]
        if (incident) router.push(`/incidents/${incident.id}`)
      }
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [incidents, router, selected])

  return (
    <table className="data-table incidents-table">
      <colgroup><col /><col className="incidents-users-column" /><col className="incidents-date-column" /><col className="incidents-state-column" /></colgroup>
      <thead><tr><th scope="col">INCIDENT</th><th scope="col">USERS</th><th scope="col">FIRST SEEN</th><th scope="col">STATE</th></tr></thead>
      <tbody>
        {incidents.map((incident, index) => (
          <tr
            data-selected={index === selected}
            key={incident.id}
            onClick={() => router.push(`/incidents/${incident.id}`)}
            onMouseEnter={() => setSelected(index)}
          >
            <td><button className="table-link" type="button"><span className="table-title">{incident.title}</span></button></td>
            <td className="numeric" aria-live="polite">{incident.users}</td>
            <td title={new Date(incident.firstSeen).toLocaleString()}>{formatRelativeDate(incident.firstSeen)}</td>
            <td><StateBadge state={incident.state} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
