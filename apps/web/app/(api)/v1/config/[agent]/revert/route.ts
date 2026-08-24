import { NextResponse } from 'next/server'

import { commands, config } from '../../../../../../src/server/container'
import { jsonError, operatorError, readJsonObject } from '../../../../../../src/server/http'

export async function POST(request: Request, { params }: { params: Promise<{ agent: string }> }) {
  const { agent } = await params
  const body = await readJsonObject(request)
  if (
    typeof body?.userHash !== 'string' ||
    body.userHash.trim().length === 0 ||
    body.userHash.length > 200
  ) {
    return jsonError(400, 'Invalid user hash')
  }
  try {
    if (typeof body.incidentId === 'string' && body.incidentId.trim().length > 0) {
      await commands.revert(body.incidentId, agent, body.userHash)
    } else {
      await config.revert(agent, body.userHash)
    }
    return NextResponse.json({ reverted: true })
  } catch (error) {
    return operatorError(error, {
      conflict: /no applied outcome|Cannot revert/,
      conflictMessage: 'Incident cannot be reverted',
      notFoundMessage: 'Override not found',
    })
  }
}
