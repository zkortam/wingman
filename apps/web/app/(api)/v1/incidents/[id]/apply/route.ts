import { NextResponse } from 'next/server'

import { commands } from '../../../../../../src/server/container'
import { jsonError, operatorError, readJsonObject } from '../../../../../../src/server/http'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await readJsonObject(request)
  if (body?.scope !== 'USER' && body?.scope !== 'GLOBAL') return jsonError(400, 'Invalid scope')
  try {
    return NextResponse.json(await commands.apply(id, body.scope))
  } catch (error) {
    return operatorError(error, {
      conflict: /verified candidate|USER apply|apply:/,
      conflictMessage: 'Incident is not ready to apply',
      notFoundMessage: 'Incident not found',
    })
  }
}
