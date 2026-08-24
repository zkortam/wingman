import { createHash, timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export const proxy = (request: NextRequest): NextResponse => {
  if (process.env.WINGMAN_RUNTIME === 'demo' || isMachineEndpoint(request)) {
    return NextResponse.next()
  }
  const username = process.env.WINGMAN_OPERATOR_USERNAME?.trim()
  const password = process.env.WINGMAN_OPERATOR_PASSWORD
  if (!username || !password) {
    return NextResponse.json({ error: 'Operator authentication is not configured' }, { status: 503 })
  }
  const expected = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
  if (!safeEqual(request.headers.get('authorization') ?? '', expected)) {
    return new NextResponse('Authentication required', {
      status: 401,
      headers: { 'www-authenticate': 'Basic realm="Wingman", charset="UTF-8"' },
    })
  }
  return NextResponse.next()
}

const isMachineEndpoint = (request: NextRequest): boolean => {
  const path = request.nextUrl.pathname
  if (path === '/api/inngest' || path === '/v1/events' || path === '/v1/reviews/tool-calls') return true
  if (request.method !== 'GET') return false
  return /^\/v1\/config\/[^/]+\/[a-f0-9]{32}$/.test(path)
}

const safeEqual = (left: string, right: string): boolean => {
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(left), digest(right))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
