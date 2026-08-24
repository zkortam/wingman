create extension if not exists pgcrypto;
create extension if not exists vector;

create table orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  user_salt bytea not null default gen_random_bytes(32),
  signing_key bytea not null default gen_random_bytes(32),
  created_at timestamptz not null default now()
);

create table agents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  base_config jsonb not null,
  base_version int not null default 1,
  active_version_id uuid,
  writable_paths text[] not null default '{}',
  max_diff_bytes int not null default 4096,
  codex_endpoint text,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create table config_versions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  version int not null,
  config jsonb not null,
  incident_id uuid,
  signature text not null,
  created_by text not null check (created_by in ('BASE', 'PIPELINE', 'HUMAN')),
  created_at timestamptz not null default now(),
  unique (agent_id, version)
);

alter table agents
  add constraint agents_active_version_fk
  foreign key (active_version_id) references config_versions(id);

create table config_overrides (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  user_hash text not null,
  version_id uuid not null references config_versions(id),
  scope text not null check (scope in ('USER', 'GLOBAL')),
  incident_id uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_resolved_at timestamptz
);

create unique index config_overrides_live
  on config_overrides (agent_id, user_hash)
  where revoked_at is null;

create table sessions (
  id uuid primary key,
  org_id uuid not null references orgs(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  user_hash text not null,
  persona_id text,
  config_version_id uuid references config_versions(id),
  task_fingerprint text,
  context jsonb not null default '{}',
  started_at timestamptz not null,
  ended_at timestamptz,
  ingested_at timestamptz not null default now()
);

create table turns (
  session_id uuid not null references sessions(id) on delete cascade,
  idx int not null,
  role text not null check (role in ('user', 'assistant', 'tool')),
  text_redacted text,
  tool_calls jsonb not null default '[]',
  embedding vector(1536),
  created_at timestamptz not null,
  primary key (session_id, idx)
);

create table signals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  turn_idx int not null,
  kind text not null check (kind in ('RETRY_REQUEST', 'RESTATED_CONSTRAINT', 'ABANDON_RESTART')),
  confidence real not null check (confidence between 0 and 1),
  baseline real,
  evidence jsonb not null default '{}',
  detected_at timestamptz not null default now(),
  unique (session_id, turn_idx, kind)
);

create table incidents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  key text not null,
  fingerprint text not null,
  signal_kind text not null,
  title text not null,
  state text not null default 'OPEN'
    check (state in ('OPEN', 'CLUSTERED', 'CLASSIFIED', 'ASSERTED', 'CANDIDATE',
                     'APPLIED', 'CONFIRMED', 'DISCARDED', 'PARKED', 'REVERTED',
                     'HUMAN_REVIEW', 'EXPIRED')),
  state_reason text,
  attempt int not null default 1 check (attempt > 0),
  verdict text check (verdict in ('VARIANCE', 'PREFERENCE', 'CONFIG_DEFECT', 'CODE_DEFECT')),
  verdict_confidence real,
  verdict_evidence jsonb,
  assertion_id uuid,
  user_hashes text[] not null default '{}',
  session_ids uuid[] not null default '{}',
  evidence_excerpts jsonb not null default '[]',
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  expires_at timestamptz,
  unique (agent_id, key)
);

create table assertions (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid references incidents(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  kind text not null check (kind in ('TOOL_CALLED', 'TOOL_ARG_EQUALS', 'OUTPUT_MATCHES_RULE')),
  params jsonb not null,
  identity text not null,
  source_session_id uuid,
  polarity text not null check (polarity in ('positive', 'negative')),
  created_at timestamptz not null default now(),
  unique (agent_id, identity)
);

alter table incidents
  add constraint incidents_assertion_fk
  foreign key (assertion_id) references assertions(id);

create table candidates (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references incidents(id) on delete cascade,
  diff jsonb not null,
  diff_bytes int not null,
  base_version_id uuid not null references config_versions(id),
  new_version_id uuid references config_versions(id),
  attempt int not null default 1 check (attempt > 0),
  iteration int not null default 1 check (iteration between 1 and 3),
  state text not null default 'PROPOSED'
    check (state in ('PROPOSED', 'VERIFIED', 'REJECTED', 'APPLIED')),
  rejected_reason text,
  created_at timestamptz not null default now(),
  unique (incident_id, attempt, iteration)
);

create table runs (
  id uuid primary key default gen_random_uuid(),
  assertion_id uuid not null references assertions(id) on delete cascade,
  incident_id uuid references incidents(id) on delete cascade,
  phase text not null check (phase in ('VERIFY_FAIL', 'VERIFY_PASS', 'POSITIVE_SUITE')),
  attempt int not null default 1 check (attempt > 0),
  config_version_id uuid references config_versions(id),
  candidate_id uuid references candidates(id),
  n int not null check (n > 0),
  pass_count int not null check (pass_count between 0 and n),
  results jsonb not null,
  tool_executions int not null default 0 check (tool_executions = 0),
  created_at timestamptz not null default now()
);

create unique index runs_verify_fail
  on runs (assertion_id, phase, attempt)
  where candidate_id is null;
create unique index runs_by_candidate
  on runs (assertion_id, phase, candidate_id, attempt)
  where candidate_id is not null;

create table outcomes (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references incidents(id) on delete cascade,
  candidate_id uuid not null references candidates(id),
  scope text not null check (scope in ('USER', 'GLOBAL')),
  applied_to text[] not null,
  applied_version_id uuid not null references config_versions(id),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'CONFIRMED', 'REFUTED', 'UNOBSERVED', 'REVERTED')),
  window_ends_at timestamptz not null,
  confirmed_at timestamptz,
  reverted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (incident_id, candidate_id, scope)
);

create index config_versions_agent on config_versions (agent_id, version desc);
create index incidents_inbox on incidents (org_id, state, last_seen desc);
create index outcomes_pending on outcomes (status, window_ends_at) where status = 'PENDING';
create index incidents_expiring on incidents (expires_at)
  where state not in ('CONFIRMED', 'DISCARDED', 'EXPIRED');
create index sessions_user on sessions (agent_id, user_hash, started_at desc);
create index assertions_positive on assertions (agent_id) where polarity = 'positive';
create index sessions_retention on sessions (ingested_at);
create index turns_embedding on turns using ivfflat (embedding vector_cosine_ops) with (lists = 100);

do $$ declare table_name text;
begin
  foreach table_name in array array[
    'orgs', 'agents', 'config_versions', 'config_overrides',
    'sessions', 'turns', 'signals', 'incidents', 'assertions',
    'runs', 'candidates', 'outcomes'
  ] loop
    execute format('alter table %I enable row level security', table_name);
  end loop;
end $$;
