export type Json =
  | boolean
  | number
  | string
  | null
  | Json[]
  | { [key: string]: Json | undefined };

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
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
      agents: Table<{
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
      }>;
      config_versions: Table<{
        id: string;
        agent_id: string;
        version: number;
        config: Json;
        incident_id: string | null;
        signature: string;
        created_by: string;
        created_at: string;
      }>;
      config_overrides: Table<{
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
      }>;
      sessions: Table<{
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
      }>;
      turns: Table<{
        session_id: string;
        idx: number;
        role: string;
        text_redacted: string | null;
        tool_calls: Json;
        embedding: string | null;
        created_at: string;
      }>;
      signals: Table<{
        id: string;
        session_id: string;
        turn_idx: number;
        kind: string;
        confidence: number;
        baseline: number | null;
        evidence: Json;
        detected_at: string;
      }>;
      incidents: Table<{
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
      }>;
      assertions: Table<{
        id: string;
        incident_id: string | null;
        agent_id: string;
        kind: string;
        params: Json;
        identity: string;
        source_session_id: string | null;
        polarity: string;
        created_at: string;
      }>;
      runs: Table<{
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
      }>;
      candidates: Table<{
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
      }>;
      outcomes: Table<{
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
      }>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
