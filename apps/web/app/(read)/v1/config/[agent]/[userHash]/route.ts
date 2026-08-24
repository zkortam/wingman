import { NextResponse } from 'next/server'

import { config } from '../../../../../../src/server/container'
import { isSdkAuthorized, jsonError } from '../../../../../../src/server/http'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ agent: string; userHash: string }> },
) {
  if (!isSdkAuthorized(request)) return jsonError(401, 'Unauthorized')
  const { agent, userHash } = await params
  if (
    process.env.WINGMAN_RUNTIME !== 'demo' &&
    (!/^[0-9a-f-]{36}$/i.test(agent) || !/^[a-f0-9]{32}$/.test(userHash))
  ) {
    return jsonError(400, 'Invalid config identity')
  }
  try {
    return NextResponse.json(await config.resolve(agent, userHash), {
      headers: { 'cache-control': 'private, no-store' },
    })
  } catch {
    return jsonError(503, 'Config unavailable')
  }
}
