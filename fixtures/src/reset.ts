import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { requiredCassetteRequests } from './cassette-manifest.ts'
import { CassetteStore } from './cassette.ts'
import type { SessionFixture } from './generate'

interface ResetOptions {
  baseUrl?: string
  fetcher?: typeof fetch
  now?: Date
}

interface ResetReport {
  sessions: number
  affected: number
  pipelineVerified: boolean
}

const loadSessions = async (): Promise<SessionFixture[]> => {
  const input = await readFile(new URL('../sessions/seeded.jsonl', import.meta.url), 'utf8')
  return input.trim().split('\n').map((line) => JSON.parse(line) as SessionFixture)
}

const oneHourMs = 3_600_000
const shiftIso = (value: string, deltaMs: number): string => new Date(new Date(value).getTime() + deltaMs).toISOString()

export const rebaseSessions = (sessions: SessionFixture[], now: Date): SessionFixture[] => {
  const first = sessions[0]
  if (!first) return []
  const originalSeedTime = new Date(first.startedAt).getTime() + oneHourMs
  const deltaMs = now.getTime() - originalSeedTime
  return sessions.map((session) => ({
    ...session,
    startedAt: shiftIso(session.startedAt, deltaMs),
    endedAt: shiftIso(session.endedAt, deltaMs),
    turns: session.turns.map((turn) => ({ ...turn, createdAt: shiftIso(turn.createdAt, deltaMs) })),
  }))
}

export const resetDemo = async (options: ResetOptions = {}): Promise<ResetReport> => {
  const cassetteDirectory = fileURLToPath(new URL('../cassettes', import.meta.url))
  await new CassetteStore({ directory: cassetteDirectory, mode: 'replay' }).preflight(requiredCassetteRequests)
  const sessions = rebaseSessions(await loadSessions(), options.now ?? new Date())
  const affected = sessions.filter((session) => session.affected).length
  if (sessions.length !== 50 || affected !== 12) throw new Error(`Invalid cohort: ${String(sessions.length)} sessions, ${String(affected)} affected`)
  if (!options.baseUrl) return { sessions: sessions.length, affected, pipelineVerified: false }

  const fetcher = options.fetcher ?? fetch
  const responses = await Promise.all(sessions.map((session) => fetcher(`${options.baseUrl}/v1/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(session),
  })))
  if (responses.some((response) => response.status !== 202)) throw new Error('Session replay failed')
  const incidentsResponse = await fetcher(`${options.baseUrl}/v1/incidents`)
  if (!incidentsResponse.ok) throw new Error('Incident verification failed')
  const incidents = await incidentsResponse.json() as Array<{ users?: number; state?: string }>
  if (!incidents.some((incident) => incident.users === 12 && incident.state === 'CANDIDATE')) {
    throw new Error('Expected 1 incident, 12 user_hashes, state=CANDIDATE')
  }
  return { sessions: sessions.length, affected, pipelineVerified: true }
}

const run = async (): Promise<void> => {
  const started = performance.now()
  const report = await resetDemo(process.env.WINGMAN_API_URL ? { baseUrl: process.env.WINGMAN_API_URL } : {})
  process.stdout.write(`Demo reset: ${String(report.sessions)} sessions, ${String(report.affected)} affected, ${report.pipelineVerified ? 'pipeline verified' : 'offline fixtures verified'}, ${String(Math.round(performance.now() - started))}ms\n`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await run()
