import { NextResponse } from 'next/server'

import { reader } from '../../../../../src/server/container'
import { operatorError } from '../../../../../src/server/http'

export async function GET() {
  try {
    return NextResponse.json(await reader.gatePrecision())
  } catch (error) {
    return operatorError(error)
  }
}
