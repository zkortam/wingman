import { NextResponse } from 'next/server'

import { commands } from '../../../../../../src/server/container'
import { operatorError } from '../../../../../../src/server/http'

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    await commands.reopen(id)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return operatorError(error, {
      conflict: /Cannot reopen/,
      conflictMessage: 'Incident cannot be reopened',
      notFoundMessage: 'Incident not found',
    })
  }
}
