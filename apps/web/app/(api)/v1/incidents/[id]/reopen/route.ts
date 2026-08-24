import { NextResponse } from 'next/server'

import { commands } from '../../../../../../src/server/container'
import { jsonError } from '../../../../../../src/server/http'

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    await commands.reopen(id)
    return new NextResponse(null, { status: 204 })
  } catch {
    return jsonError(404, 'Incident not found')
  }
}
