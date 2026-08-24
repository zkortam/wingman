import { ToolCallReviewRequestSchema } from '@wingman/schema'
import { NextResponse } from 'next/server'

import { isSdkAuthorized, jsonError, readJsonObject } from '../../../../../src/server/http'
import { reviews } from '../../../../../src/server/container'

export async function POST(request: Request) {
  if (!isSdkAuthorized(request)) return jsonError(401, 'Unauthorized')
  const body = await readJsonObject(request)
  const parsed = ToolCallReviewRequestSchema.safeParse(body)
  if (!parsed.success) return jsonError(400, 'Invalid review payload')
  try {
    return NextResponse.json(await reviews.review(parsed.data))
  } catch {
    return jsonError(503, 'Review unavailable')
  }
}
