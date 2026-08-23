import { NextResponse } from 'next/server'

export const readJsonObject = async (request: Request): Promise<Record<string, unknown> | null> => {
  try {
    const value = await request.json() as unknown
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
  } catch {
    return null
  }
}

export const jsonError = (status: number, message: string): NextResponse =>
  NextResponse.json({ error: message }, { status })
