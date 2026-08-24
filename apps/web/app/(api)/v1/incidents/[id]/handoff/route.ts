import { NextResponse } from 'next/server'

import { commands } from '../../../../../../src/server/container'
import { jsonError } from '../../../../../../src/server/http'

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await commands.handoff(id)
  return result.payload ? NextResponse.json(result) : jsonError(404, 'Handoff not found')
}
