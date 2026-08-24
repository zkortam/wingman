create table pipeline_handoffs (
  incident_id      uuid primary key references incidents(id) on delete cascade,
  payload          jsonb not null,
  remote_thread_id text,
  created_at       timestamptz not null default now()
);

alter table pipeline_handoffs enable row level security;
