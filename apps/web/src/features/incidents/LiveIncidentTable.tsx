'use client'

import { useEffect, useState } from 'react'

import { apiClient } from '../../data/api-client'
import type { IncidentSummaryView } from '../../domain/incidents'
import { Empty } from '../../ui/Empty'
import { IncidentTable } from '../../ui/IncidentTable'

interface LiveIncidentTableProps {
  initialIncidents: IncidentSummaryView[]
  client?: Pick<typeof apiClient, 'listIncidents'>
}

export const LiveIncidentTable = ({ initialIncidents, client = apiClient }: LiveIncidentTableProps) => {
  const [incidents, setIncidents] = useState(initialIncidents)

  useEffect(() => {
    let active = true
    const refresh = async (): Promise<void> => {
      try {
        const next = await client.listIncidents()
        if (active) setIncidents(next)
      } catch {
        return
      }
    }
    const interval = window.setInterval(() => void refresh(), 2_000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [client])

  return incidents.length > 0
    ? <IncidentTable incidents={incidents} />
    : <Empty action={{ href: '/settings', label: 'View integration guide' }} fact="No incidents yet. Outcome needs about 500 sessions a month to find anything." />
}
