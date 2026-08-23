import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

interface GenerateOptions {
  defectId: string
  sessions: number
  hitRate: number
  now?: Date
}

export interface SessionFixture {
  id: string
  agentId: string
  userId: string
  personaId: string
  defectId: string
  affected: boolean
  startedAt: string
  endedAt: string
  context: { viewFilters: { stage: string } }
  turns: Array<{ role: 'user' | 'assistant'; text: string; createdAt: string }>
}

const hourMs = 3_600_000

export const generateSessions = (options: GenerateOptions): SessionFixture[] => {
  const now = options.now ?? new Date()
  const affectedCount = Math.round(options.sessions * options.hitRate)
  return Array.from({ length: options.sessions }, (_, index) => {
    const affected = index < affectedCount
    const startedAt = new Date(now.getTime() - (index + 1) * hourMs)
    const endedAt = new Date(startedAt.getTime() + 120_000)
    return {
      id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      agentId: 'ops-copilot',
      userId: `ledgerline-user-${String(index + 1).padStart(2, '0')}`,
      personaId: `p${(index % 8) + 1}`,
      defectId: options.defectId,
      affected,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      context: { viewFilters: { stage: 'Negotiation' } },
      turns: affected
        ? [
            { role: 'user', text: 'Export these opportunities to CSV.', createdAt: startedAt.toISOString() },
            { role: 'assistant', text: 'Exported 50 opportunities.', createdAt: new Date(startedAt.getTime() + 30_000).toISOString() },
            { role: 'user', text: 'No, just the ones I have filtered.', createdAt: new Date(startedAt.getTime() + 60_000).toISOString() },
          ]
        : [
            { role: 'user', text: 'Show my active opportunities.', createdAt: startedAt.toISOString() },
            { role: 'assistant', text: 'Here are your active opportunities.', createdAt: new Date(startedAt.getTime() + 30_000).toISOString() },
          ],
    }
  })
}

const argument = (name: string, fallback: string): string => {
  const index = process.argv.indexOf(name)
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback
}

const run = async (): Promise<void> => {
  const sessions = generateSessions({
    defectId: argument('--defect', 'OC-001'),
    sessions: Number(argument('--sessions', '50')),
    hitRate: Number(argument('--hit-rate', '0.24')),
  })
  const output = resolve(import.meta.dirname, '../sessions/seeded.jsonl')
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${sessions.map((session) => JSON.stringify(session)).join('\n')}\n`)
  process.stdout.write(`Generated ${sessions.length} sessions at ${output}\n`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await run()
