import { NextResponse } from 'next/server'

import { commands } from '../../../../../../src/server/container'
import { jsonError, operatorError } from '../../../../../../src/server/http'

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const result = await commands.handoff(id)
    return result.payload ? NextResponse.json(result) : jsonError(404, 'Handoff not found')
  } catch (error) {
    return operatorError(error, {
      conflict: /Handoff requires/,
      conflictMessage: 'Incident is not ready for handoff',
      notFoundMessage: 'Incident not found',
    })
  }
}
