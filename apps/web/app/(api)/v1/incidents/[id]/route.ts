import { NextResponse } from 'next/server'

import { reader } from '../../../../../src/server/container'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const incident = await reader.getIncident(id)
  return incident ? NextResponse.json(incident) : NextResponse.json({ error: 'Incident not found' }, { status: 404 })
}
