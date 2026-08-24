export type Json =
  | boolean
  | number
  | string
  | null
  | Json[]
  | { [key: string]: Json | undefined };

type Table<Row, Relationships extends readonly unknown[] = []> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: Relationships;
};

/** Every foreign key in 0001_init.sql is single-column and references `id`.
 *  supabase-js resolves embedded selects such as `agents(...,orgs(signing_key))`
 *  through this metadata; without it the row type collapses to `never`. */
type Rel<
  Name extends string,
  Column extends string,
  Referenced extends string,
> = {
  foreignKeyName: Name;
  columns: [Column];
  isOneToOne: false;
  referencedRelation: Referenced;
  referencedColumns: ["id"];
};

type Timestamped = { created_at: string };

export interface Database {
  public: {
    Tables: {
      orgs: Table<
        {
          id: string;
          name: string;
          user_salt: string;
          signing_key: string;
        } & Timestamped
      >;
      agents: Table<
        {
          id: string;
          org_id: string;
          name: string;
          base_config: Json;
          base_version: number;
          active_version_id: string | null;
          writable_paths: string[];
          max_diff_bytes: number;
          codex_endpoint: string | null;
          created_at: string;
        },
        [
          Rel<"agents_org_id_fkey", "org_id", "orgs">,
          Rel<"agents_active_version_fk", "active_version_id", "config_versions">,
        ]
      >;
      config_versions: Table<
        {
          id: string;
          agent_id: string;
          version: number;
          config: Json;
          incident_id: string | null;
          signature: string;
          created_by: string;
          created_at: string;
        },
        [Rel<"config_versions_agent_id_fkey", "agent_id", "agents">]
      >;
      config_overrides: Table<
        {
          id: string;
          agent_id: string;
          user_hash: string;
          version_id: string;
          scope: string;
          incident_id: string | null;
          created_at: string;
          expires_at: string | null;
          revoked_at: string | null;
          last_resolved_at: string | null;
        },
        [
          Rel<"config_overrides_agent_id_fkey", "agent_id", "agents">,
          Rel<"config_overrides_version_id_fkey", "version_id", "config_versions">,
        ]
      >;
      sessions: Table<
        {
          id: string;
          org_id: string;
          agent_id: string;
          user_hash: string;
          persona_id: string | null;
          config_version_id: string | null;
          task_fingerprint: string | null;
          context: Json;
          started_at: string;
          ended_at: string | null;
          ingested_at: string;
        },
        [
          Rel<"sessions_org_id_fkey", "org_id", "orgs">,
          Rel<"sessions_agent_id_fkey", "agent_id", "agents">,
          Rel<"sessions_config_version_id_fkey", "config_version_id", "config_versions">,
        ]
      >;
      turns: Table<
        {
          session_id: string;
          idx: number;
          role: string;
          text_redacted: string | null;
          tool_calls: Json;
          embedding: string | null;
          created_at: string;
        },
        [Rel<"turns_session_id_fkey", "session_id", "sessions">]
      >;
      signals: Table<
        {
          id: string;
          session_id: string;
          turn_idx: number;
          kind: string;
          confidence: number;
          baseline: number | null;
          evidence: Json;
          detected_at: string;
        },
        [Rel<"signals_session_id_fkey", "session_id", "sessions">]
      >;
      incidents: Table<
        {
          id: string;
          org_id: string;
          agent_id: string;
          key: string;
          fingerprint: string;
          signal_kind: string;
          title: string;
          state: string;
          state_reason: string | null;
          attempt: number;
          verdict: string | null;
          verdict_confidence: number | null;
          verdict_evidence: Json | null;
          assertion_id: string | null;
          user_hashes: string[];
          session_ids: string[];
          evidence_excerpts: Json;
          first_seen: string;
          last_seen: string;
          expires_at: string | null;
        },
        [
          Rel<"incidents_org_id_fkey", "org_id", "orgs">,
          Rel<"incidents_agent_id_fkey", "agent_id", "agents">,
          Rel<"incidents_assertion_fk", "assertion_id", "assertions">,
        ]
      >;
      assertions: Table<
        {
          id: string;
          incident_id: string | null;
          agent_id: string;
          kind: string;
          params: Json;
          identity: string;
          source_session_id: string | null;
          polarity: string;
          created_at: string;
        },
        [
          Rel<"assertions_incident_id_fkey", "incident_id", "incidents">,
          Rel<"assertions_agent_id_fkey", "agent_id", "agents">,
        ]
      >;
      runs: Table<
        {
          id: string;
          assertion_id: string;
          incident_id: string | null;
          phase: string;
          attempt: number;
          config_version_id: string | null;
          candidate_id: string | null;
          n: number;
          pass_count: number;
          results: Json;
          tool_executions: number;
          created_at: string;
        },
        [
          Rel<"runs_assertion_id_fkey", "assertion_id", "assertions">,
          Rel<"runs_incident_id_fkey", "incident_id", "incidents">,
          Rel<"runs_config_version_id_fkey", "config_version_id", "config_versions">,
          Rel<"runs_candidate_id_fkey", "candidate_id", "candidates">,
        ]
      >;
      candidates: Table<
        {
          id: string;
          incident_id: string;
          diff: Json;
          diff_bytes: number;
          base_version_id: string;
          new_version_id: string | null;
          attempt: number;
          iteration: number;
          state: string;
          rejected_reason: string | null;
          created_at: string;
        },
        [
          Rel<"candidates_incident_id_fkey", "incident_id", "incidents">,
          Rel<"candidates_base_version_id_fkey", "base_version_id", "config_versions">,
          Rel<"candidates_new_version_id_fkey", "new_version_id", "config_versions">,
        ]
      >;
      outcomes: Table<
        {
          id: string;
          incident_id: string;
          candidate_id: string;
          scope: string;
          applied_to: string[];
          applied_version_id: string;
          status: string;
          window_ends_at: string;
          confirmed_at: string | null;
          reverted_at: string | null;
          created_at: string;
        },
        [
          Rel<"outcomes_incident_id_fkey", "incident_id", "incidents">,
          Rel<"outcomes_candidate_id_fkey", "candidate_id", "candidates">,
          Rel<"outcomes_applied_version_id_fkey", "applied_version_id", "config_versions">,
        ]
      >;
      pipeline_handoffs: Table<
        {
          incident_id: string;
          payload: Json;
          remote_thread_id: string | null;
          created_at: string;
        },
        [Rel<"pipeline_handoffs_incident_id_fkey", "incident_id", "incidents">]
      >;
      pipeline_ledger: Table<
        {
          id: string;
          incident_id: string;
          fingerprint: string;
          diff: Json;
          outcome: string;
          created_at: string;
        },
        [Rel<"pipeline_ledger_incident_id_fkey", "incident_id", "incidents">]
      >;
      preference_rules: Table<
        {
          id: string;
          org_id: string;
          agent_id: string;
          user_hash: string;
          rule: string;
          source_session_id: string;
          source_turn_idx: number;
          state: string;
          created_at: string;
          revoked_at: string | null;
        },
        [
          Rel<"preference_rules_org_id_fkey", "org_id", "orgs">,
          Rel<"preference_rules_agent_id_fkey", "agent_id", "agents">,
        ]
      >;
      capability_requests: Table<
        {
          id: string;
          org_id: string;
          agent_id: string;
          key: string;
          title: string;
          implied_tool: string | null;
          user_hashes: string[];
          session_ids: string[];
          evidence_excerpts: Json;
          state: string;
          first_seen: string;
          last_seen: string;
        },
        [
          Rel<"capability_requests_org_id_fkey", "org_id", "orgs">,
          Rel<"capability_requests_agent_id_fkey", "agent_id", "agents">,
        ]
      >;
    };
    Views: Record<string, never>;
    Functions: {
      wingman_join_incident: {
        Args: {
          p_org_id: string;
          p_agent_id: string;
          p_key: string;
          p_fingerprint: string;
          p_signal_kind: string;
          p_title: string;
          p_user_hash: string;
          p_session_id: string;
          p_evidence: Json;
          p_seen_at: string;
          p_expires_at: string;
          p_cluster_minimum: number;
        };
        Returns: Database["public"]["Tables"]["incidents"]["Row"];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
