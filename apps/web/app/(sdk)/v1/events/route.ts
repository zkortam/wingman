import { createProductionIngestService, type IngestService } from '@wingman/ingest'
import { SessionInputSchema } from '@wingman/schema'
import { NextResponse } from 'next/server'

import { isSdkAuthorized, jsonError, readJsonObject } from '../../../../src/server/http'

let productionService: IngestService | undefined

export async function POST(request: Request) {
  if (!isSdkAuthorized(request)) return jsonError(401, 'Unauthorized')
  const payload = await readJsonObject(request)
  if (payload === null) return jsonError(400, 'Invalid event payload')
  if (process.env.WINGMAN_RUNTIME === 'demo') {
    if (!SessionInputSchema.safeParse(payload).success) return jsonError(400, 'Invalid event payload')
    return NextResponse.json({ status: 202 }, { status: 202 })
  }
  try {
    productionService ??= createProductionIngestService()
    const result = await productionService.ingestEvents(payload)
    return NextResponse.json(result, { status: result.status })
  } catch (error) {
    if (error instanceof Error && (error.name === 'ZodError' || error.name === 'RedactionVerificationError')) {
      return jsonError(400, 'Event payload failed validation')
    }
    return jsonError(503, 'Event ingest unavailable')
  }
}
