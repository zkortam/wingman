-- Scope run uniqueness to the incident that produced the run.

drop index if exists runs_verify_fail;
drop index if exists runs_by_candidate;

-- `coalesce` is required because NULL never equals NULL in a unique index, and POSITIVE_SUITE runs.
create unique index runs_verify_fail
  on runs (assertion_id, coalesce(incident_id, '00000000-0000-0000-0000-000000000000'::uuid), phase, attempt)
  where candidate_id is null;

create unique index runs_by_candidate
  on runs (assertion_id, coalesce(incident_id, '00000000-0000-0000-0000-000000000000'::uuid), phase, candidate_id, attempt)
  where candidate_id is not null;
