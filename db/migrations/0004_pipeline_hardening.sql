-- Align CHECKs with schema enums, persist the ledger, and stop mutating terminal incidents.

alter table signals drop constraint if exists signals_kind_check;
alter table signals
  add constraint signals_kind_check
  check (kind in (
    'RETRY_REQUEST',
    'RESTATED_CONSTRAINT',
    'ABANDON_RESTART',
    'PREFERENCE_STATED'
  ));

alter table incidents drop constraint if exists incidents_verdict_check;
alter table incidents
  add constraint incidents_verdict_check
  check (
    verdict is null
    or verdict in (
      'VARIANCE',
      'PREFERENCE',
      'CONFIG_DEFECT',
      'CODE_DEFECT',
      'UNSUPPORTED'
    )
  );

create table pipeline_ledger (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references incidents(id) on delete cascade,
  fingerprint text not null,
  diff jsonb not null,
  outcome text not null,
  created_at timestamptz not null default now()
);

create index pipeline_ledger_fingerprint_idx on pipeline_ledger (fingerprint, created_at desc);

alter table pipeline_ledger enable row level security;

create table preference_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  user_hash text not null,
  rule text not null,
  source_session_id uuid not null,
  source_turn_idx int not null,
  state text not null default 'ACTIVE' check (state in ('ACTIVE', 'REVOKED')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table preference_rules enable row level security;

create table capability_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  key text not null,
  title text not null,
  implied_tool text,
  user_hashes text[] not null default '{}',
  session_ids uuid[] not null default '{}',
  evidence_excerpts jsonb not null default '[]',
  state text not null default 'OPEN'
    check (state in ('OPEN', 'ACKNOWLEDGED', 'PLANNED', 'SHIPPED', 'DECLINED')),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (agent_id, key)
);

alter table capability_requests enable row level security;

create or replace function wingman_join_incident(
  p_org_id uuid,
  p_agent_id uuid,
  p_key text,
  p_fingerprint text,
  p_signal_kind text,
  p_title text,
  p_user_hash text,
  p_session_id uuid,
  p_evidence jsonb,
  p_seen_at timestamptz,
  p_expires_at timestamptz,
  p_cluster_minimum int
) returns incidents
language sql
set search_path = public
as $$
  insert into incidents (
    org_id, agent_id, key, fingerprint, signal_kind, title, state,
    user_hashes, session_ids, evidence_excerpts, last_seen, expires_at
  ) values (
    p_org_id, p_agent_id, p_key, p_fingerprint, p_signal_kind, p_title, 'OPEN',
    array[p_user_hash], array[p_session_id], p_evidence, p_seen_at, p_expires_at
  )
  on conflict (agent_id, key) do update set
    user_hashes = case
      when incidents.state in ('OPEN', 'CLUSTERED') then array(
        select distinct value
        from unnest(incidents.user_hashes || excluded.user_hashes) as value
      )
      else incidents.user_hashes
    end,
    session_ids = case
      when incidents.state in ('OPEN', 'CLUSTERED') then array(
        select distinct value
        from unnest(incidents.session_ids || excluded.session_ids) as value
      )
      else incidents.session_ids
    end,
    evidence_excerpts = case
      when incidents.state in ('OPEN', 'CLUSTERED') then (
        select coalesce(jsonb_agg(value), '[]'::jsonb)
        from (
          select distinct value
          from jsonb_array_elements(
            incidents.evidence_excerpts || excluded.evidence_excerpts
          ) as value
        ) as unique_evidence
      )
      else incidents.evidence_excerpts
    end,
    last_seen = case
      when incidents.state in ('OPEN', 'CLUSTERED')
        then greatest(incidents.last_seen, excluded.last_seen)
      else incidents.last_seen
    end,
    expires_at = case
      when incidents.state in ('OPEN', 'CLUSTERED') then excluded.expires_at
      else incidents.expires_at
    end,
    state = case
      when incidents.state = 'OPEN' and cardinality(array(
        select distinct value
        from unnest(incidents.session_ids || excluded.session_ids) as value
      )) >= p_cluster_minimum then 'CLUSTERED'
      else incidents.state
    end
  returning incidents.*;
$$;
