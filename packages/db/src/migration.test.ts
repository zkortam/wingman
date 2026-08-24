import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../../db/migrations/0001_init.sql', import.meta.url),
  'utf8',
)
const handoffMigration = readFileSync(
  new URL('../../../db/migrations/0002_pipeline_handoffs.sql', import.meta.url),
  'utf8',
)
const incidentJoinMigration = readFileSync(
  new URL('../../../db/migrations/0003_atomic_incident_join.sql', import.meta.url),
  'utf8',
)
const hardeningMigration = readFileSync(
  new URL('../../../db/migrations/0004_pipeline_hardening.sql', import.meta.url),
  'utf8',
)

const runUniquenessMigration = readFileSync(
  new URL('../../../db/migrations/0005_run_uniqueness_by_incident.sql', import.meta.url),
  'utf8',
)

const indexMigration = readFileSync(
  new URL('../../../db/migrations/0006_hot_query_indexes.sql', import.meta.url),
  'utf8',
)

describe('initial migration invariants', () => {
  it('preserves attempts and corrected uniqueness', () => {
    expect(migration).toMatch(/attempt int not null default 1/g)
    expect(migration).toContain('unique (incident_id, attempt, iteration)')
    expect(migration).toContain('on runs (assertion_id, phase, attempt)')
  })

  /** Assertions are deduplicated per agent, so two incidents on one agent share an assertion id. */
  it('scopes run uniqueness to the incident that produced the run', () => {
    expect(runUniquenessMigration).toContain('drop index if exists runs_verify_fail')
    expect(runUniquenessMigration).toContain('drop index if exists runs_by_candidate')
    for (const index of ['runs_verify_fail', 'runs_by_candidate']) {
      const definition = runUniquenessMigration.slice(
        runUniquenessMigration.indexOf(`create unique index ${index}`),
      )
      expect(definition).toContain('coalesce(incident_id')
    }
  })

  it('enforces zero tool execution and deny-all RLS', () => {
    expect(migration).toContain('check (tool_executions = 0)')
    expect(migration).toContain('alter table %I enable row level security')
    expect(migration).not.toMatch(/create policy/i)
  })

  it('persists pipeline handoffs with one idempotent row per incident', () => {
    expect(handoffMigration).toContain('create table pipeline_handoffs')
    expect(handoffMigration).toMatch(/incident_id\s+uuid primary key/)
    expect(handoffMigration).toContain('enable row level security')
  })

  it('atomically creates or joins incidents and limits execution to the service role', () => {
    expect(incidentJoinMigration).toContain('on conflict (agent_id, key) do update')
    expect(incidentJoinMigration).toContain('incidents.session_ids || excluded.session_ids')
    expect(incidentJoinMigration).toContain('from public')
    // Applied only when the role exists; service_role is Supabase-only.
    expect(incidentJoinMigration).toContain("rolname = 'service_role'")
  })

  it('aligns signal and verdict checks and persists the ledger', () => {
    expect(hardeningMigration).toContain('PREFERENCE_STATED')
    expect(hardeningMigration).toContain('UNSUPPORTED')
    expect(hardeningMigration).toContain('create table pipeline_ledger')
    expect(hardeningMigration).toContain("incidents.state in ('OPEN', 'CLUSTERED')")
  })
})

/** Each of these is a query the operator console or the ingest path runs on every request. */
describe('hot query shapes are indexed', () => {
  it.each([
    ['runs by incident and attempt', 'runs (incident_id, attempt, phase)'],
    ['the latest candidate in an attempt', 'candidates (incident_id, attempt, iteration desc)'],
    ['outcomes newest-first per incident', 'outcomes (incident_id, created_at desc)'],
    ['the pending-outcome lookup by user hash', 'outcomes using gin (applied_to)'],
    ['signals by session', 'signals (session_id, kind)'],
    ['a session and its turns', 'turns (session_id, idx)'],
    ['an organisation window of sessions', 'sessions (org_id, started_at desc)'],
    [
      'the cancelled-restart lookup',
      'sessions (agent_id, user_hash, task_fingerprint, started_at desc)',
    ],
    ['in-flight incidents for an agent', 'incidents (agent_id, state)'],
    ['a handoff by incident', 'pipeline_handoffs (incident_id)'],
  ])('indexes %s', (_name, definition) => {
    expect(indexMigration).toContain(definition)
  })

  it('creates every index idempotently so a partial apply can be retried', () => {
    const creates = indexMigration.match(/create index/g) ?? []
    const guarded = indexMigration.match(/create index if not exists/g) ?? []
    expect(guarded).toHaveLength(creates.length)
  })
})
