create function wingman_join_incident(
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
    user_hashes = array(
      select distinct value
      from unnest(incidents.user_hashes || excluded.user_hashes) as value
    ),
    session_ids = array(
      select distinct value
      from unnest(incidents.session_ids || excluded.session_ids) as value
    ),
    evidence_excerpts = (
      select coalesce(jsonb_agg(value), '[]'::jsonb)
      from (
        select distinct value
        from jsonb_array_elements(
          incidents.evidence_excerpts || excluded.evidence_excerpts
        ) as value
      ) as unique_evidence
    ),
    last_seen = greatest(incidents.last_seen, excluded.last_seen),
    expires_at = excluded.expires_at,
    state = case
      when incidents.state = 'OPEN' and cardinality(array(
        select distinct value
        from unnest(incidents.session_ids || excluded.session_ids) as value
      )) >= p_cluster_minimum then 'CLUSTERED'
      else incidents.state
    end
  returning incidents.*;
$$;

revoke all on function wingman_join_incident(
  uuid, uuid, text, text, text, text, text, uuid, jsonb,
  timestamptz, timestamptz, int
) from public;
-- service_role only exists on Supabase. On a direct connection the owner already
-- has execute, so the grant is applied only when the role is present.
do $grant$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function wingman_join_incident(
      uuid, uuid, text, text, text, text, text, uuid, jsonb,
      timestamptz, timestamptz, int
    ) to service_role';
  end if;
end
$grant$;
