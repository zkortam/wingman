import { NextResponse } from 'next/server'

import { config } from '../../../../../../src/server/container'

export async function GET(_: Request, { params }: { params: Promise<{ agent: string; userHash: string }> }) {
  const { agent, userHash } = await params
  return NextResponse.json(await config.resolve(agent, userHash), {
    headers: { 'cache-control': 'private, no-store' },
  })
}
