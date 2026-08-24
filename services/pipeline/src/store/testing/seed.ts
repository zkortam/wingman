import type { Database } from '@wingman/db'

export const ORG = '5e8e68e1-a768-4342-b4f4-d9a1f8ceaa26'
export const EMPTY_ORG = '11111111-1111-4111-8111-111111111111'
export const AGENT = '4ee0d899-d63d-4bc2-b47a-25aa25c6078b'
export const INCIDENT = '22222222-2222-4222-8222-222222222222'
export const SESSION = '33333333-3333-4333-8333-333333333333'
export const USER_HASH = 'a'.repeat(32)

export const BASE_CONFIG = {
  systemPrompt: 'You are a careful operations assistant.',
  tools: { export_records: { description: 'Export records.' } },
  retrieval: {},
  rules: [],
}

const TABLES = [
  'pipeline_ledger',
  'pipeline_handoffs',
  'outcomes',
  'candidates',
  'runs',
  'assertions',
  'incidents',
  'signals',
  'turns',
  'sessions',
  'config_overrides',
  'preference_rules',
  'capability_requests',
]

/** Empties every table the pipeline writes, leaving the schema in place. */
export async function truncateAll(sql: Database): Promise<void> {
  await sql.unsafe(`truncate ${TABLES.join(', ')}, agents, orgs restart identity cascade`)
}

/** One organisation, agent, session and clustered incident, ready for the contract. */
export async function seedFixture(sql: Database): Promise<void> {
  await truncateAll(sql)
  await sql`
    insert into orgs (id, name, user_salt, signing_key)
    values (${ORG}::uuid, 'Contract org', convert_to('salt', 'UTF8'), convert_to('signing-key', 'UTF8')),
           (${EMPTY_ORG}::uuid, 'Empty org', convert_to('salt', 'UTF8'), convert_to('signing-key', 'UTF8'))
  `
  await sql`
    insert into agents (id, org_id, name, base_config, base_version, writable_paths, max_diff_bytes)
    values (
      ${AGENT}::uuid, ${ORG}::uuid, 'ops-copilot', ${sql.json(BASE_CONFIG)}::jsonb, 1,
      array['rules', 'tools.*.description'], 4096
    )
  `
  await sql`
    insert into sessions (
      id, org_id, agent_id, user_hash, context, started_at, ended_at, ingested_at
    ) values (
      ${SESSION}::uuid, ${ORG}::uuid, ${AGENT}::uuid, ${USER_HASH}, '{}'::jsonb,
      '2026-08-01T00:00:00.000Z', '2026-08-01T00:01:00.000Z', '2026-08-01T00:01:00.000Z'
    )
  `
  await sql`
    insert into turns (session_id, idx, role, text_redacted, tool_calls, created_at) values
      (${SESSION}::uuid, 0, 'user', 'Export the filtered view.', '[]'::jsonb, '2026-08-01T00:00:00.000Z'),
      (${SESSION}::uuid, 1, 'assistant', 'Exporting.',
        ${sql.json([{ name: 'export_records', args: {} }])}::jsonb, '2026-08-01T00:00:05.000Z')
  `
  await sql`
    insert into incidents (
      id, org_id, agent_id, key, fingerprint, signal_kind, title, state,
      user_hashes, session_ids, evidence_excerpts, first_seen, last_seen, expires_at
    ) values (
      ${INCIDENT}::uuid, ${ORG}::uuid, ${AGENT}::uuid, 'export-dropped-filter', 'fingerprint',
      'RETRY_REQUEST', 'Export dropped the active filter', 'CLUSTERED',
      array[${USER_HASH}]::text[], array[${SESSION}]::uuid[], '[]'::jsonb,
      '2026-08-01T00:00:00.000Z', '2026-08-02T00:00:00.000Z', '2026-09-01T00:00:00.000Z'
    )
  `
}
