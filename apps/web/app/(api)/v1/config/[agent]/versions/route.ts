import { NextResponse } from 'next/server'

import { config } from '../../../../../../src/server/container'
import { jsonError } from '../../../../../../src/server/http'

export async function GET(_: Request, { params }: { params: Promise<{ agent: string }> }) {
  const { agent } = await params
  try {
    return NextResponse.json(await config.listVersions(agent))
  } catch {
    return jsonError(503, 'Config service unavailable')
  }
}
