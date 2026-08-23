import { NextResponse } from 'next/server'

import { reader } from '../../../../src/server/container'

export async function GET() {
  return NextResponse.json(await reader.listOutcomes())
}
