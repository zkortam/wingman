import type { ServiceClient } from "@wingman/db";
import type { SessionInput, Signal, ToolCall } from "@wingman/schema";

export interface StoredTurn {
  sessionId: string;
  idx: number;
  role: "user" | "assistant" | "tool";
  textRedacted: string | null;
  toolCalls: ToolCall[];
  embedding: number[] | null;
  createdAt: string;
}

export interface IngestStore {
  writeSession(
    session: SessionInput,
    fingerprint: string | null,
    turns: StoredTurn[],
  ): Promise<void>;
  writeSignals(signals: Signal[]): Promise<void>;
}

export function createSupabaseIngestStore(client: ServiceClient): IngestStore {
  return {
    async writeSession(session, fingerprint, turns) {
      const context = {
        viewFilters: session.viewFilters,
        selectedIds: session.selectedIds,
        dateRange: session.dateRange,
        lastQuery: session.lastQuery,
        userRules: session.userRules,
        generationCancelled: session.generationCancelled,
      };
      const { error: sessionError } = await client.from("sessions").upsert(
        {
          id: session.id,
          org_id: session.orgId,
          agent_id: session.agentId,
          user_hash: session.userHash,
          persona_id: session.personaId ?? null,
          config_version_id: session.configVersionId ?? null,
          task_fingerprint: fingerprint,
          context,
          started_at: session.startedAt,
          ended_at: session.endedAt ?? null,
        },
        { onConflict: "id", ignoreDuplicates: true },
      );
      if (sessionError) throw sessionError;

      const rows = turns.map((turn) => ({
        session_id: turn.sessionId,
        idx: turn.idx,
        role: turn.role,
        text_redacted: turn.textRedacted,
        tool_calls: turn.toolCalls,
        embedding:
          turn.embedding === null ? null : `[${turn.embedding.join(",")}]`,
        created_at: turn.createdAt,
      }));
      const { error: turnsError } = await client
        .from("turns")
        .upsert(rows, { onConflict: "session_id,idx", ignoreDuplicates: true });
      if (turnsError) throw turnsError;
    },

    async writeSignals(signals) {
      if (signals.length === 0) return;
      const { error } = await client.from("signals").upsert(
        signals.map((signal) => ({
          session_id: signal.sessionId,
          turn_idx: signal.turnIdx,
          kind: signal.kind,
          confidence: signal.confidence,
          baseline: signal.baseline,
          evidence: signal.evidence,
          ...(signal.detectedAt === undefined
            ? {}
            : { detected_at: signal.detectedAt }),
        })),
        { onConflict: "session_id,turn_idx,kind", ignoreDuplicates: true },
      );
      if (error) throw error;
    },
  };
}
