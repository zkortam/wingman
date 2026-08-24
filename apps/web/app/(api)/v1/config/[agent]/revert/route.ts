import { NextResponse } from 'next/server'

import { config } from '../../../../../../src/server/container'
import { jsonError, readJsonObject } from '../../../../../../src/server/http'

export async function POST(request: Request) {
  const body = await readJsonObject(request)
  if (typeof body?.userHash !== 'string' || body.userHash.trim().length === 0 || body.userHash.length > 200) {
    return jsonError(400, 'Invalid user hash')
  }
  try {
    await config.revert(body.userHash)
    return NextResponse.json({ reverted: true })
  } catch {
    return jsonError(404, 'Override not found')
  }
}
