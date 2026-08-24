import { NextResponse } from 'next/server'

import { reader } from '../../../../../src/server/container'
import { jsonError, operatorError } from '../../../../../src/server/http'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const incident = await reader.getIncident(id)
    return incident ? NextResponse.json(incident) : jsonError(404, 'Incident not found')
  } catch (error) {
    return operatorError(error, { notFoundMessage: 'Incident not found' })
  }
}
