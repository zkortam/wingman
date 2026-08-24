import { NextResponse } from 'next/server'

import { reader } from '../../../../src/server/container'
import { jsonError } from '../../../../src/server/http'

export async function GET() {
  try {
    return NextResponse.json(await reader.listIncidents())
  } catch {
    return jsonError(503, 'Incident service unavailable')
  }
}
