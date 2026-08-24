import { NextResponse } from 'next/server'

import { commands } from '../../../../../../src/server/container'
import { jsonError, operatorError, readJsonObject } from '../../../../../../src/server/http'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await readJsonObject(request)
  if (
    typeof body?.reason !== 'string' ||
    body.reason.trim().length === 0 ||
    body.reason.length > 500
  )
    return jsonError(400, 'Invalid reason')
  try {
    await commands.dismiss(id, body.reason)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return operatorError(error, { notFoundMessage: 'Incident not found' })
  }
}
