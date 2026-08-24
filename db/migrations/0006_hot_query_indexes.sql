-- Index the query shapes the operator console and the ingest path run constantly.

-- getSnapshot reads runs for one incident and attempt; gatePrecision reads the VERIFY_FAIL run for.
create index if not exists runs_by_incident on runs (incident_id, attempt, phase);

-- getSnapshot and latestCandidate order candidates within an attempt.
create index if not exists candidates_latest
  on candidates (incident_id, attempt, iteration desc);

-- getOutcomeForIncident and the snapshot read outcomes newest-first per incident.
create index if not exists outcomes_by_incident on outcomes (incident_id, created_at desc);

-- findPendingOutcome filters PENDING outcomes by the user hashes they applied to.
create index if not exists outcomes_applied_to on outcomes using gin (applied_to);

-- countSignals and the baseline rates both read signals by session.
create index if not exists signals_by_session on signals (session_id, kind);

-- getSession reads a session's turns in index order.
create index if not exists turns_by_session on turns (session_id, idx);

-- silentFailureRate scans an organisation's sessions inside a time window.
create index if not exists sessions_org_window on sessions (org_id, started_at desc);

-- hasMatchingRestart looks for a cancelled restart of the same task.
create index if not exists sessions_task_restart
  on sessions (agent_id, user_hash, task_fingerprint, started_at desc);

-- countInFlight counts an agent's incidents that are still being worked on.
create index if not exists incidents_in_flight on incidents (agent_id, state);

-- getHandoff and the operator handoff command read one row per incident.
create index if not exists pipeline_handoffs_incident on pipeline_handoffs (incident_id);
