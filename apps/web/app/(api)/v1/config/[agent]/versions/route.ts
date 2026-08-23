import { NextResponse } from 'next/server'

import { config } from '../../../../../../src/server/container'

export async function GET() {
  return NextResponse.json(await config.listVersions())
}
