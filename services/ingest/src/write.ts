import type { Executor } from '@wingman/db'
import type { SessionInput, Signal, ToolCall } from '@wingman/schema'

export interface StoredTurn {
  sessionId: string
  idx: number
  role: 'user' | 'assistant' | 'tool'
  textRedacted: string | null
  toolCalls: ToolCall[]
  embedding: number[] | null
  createdAt: string
}

export interface IngestStore {
  writeSession(
    session: SessionInput,
    fingerprint: string | null,
    turns: StoredTurn[],
  ): Promise<void>
  writeSignals(signals: Signal[]): Promise<void>
}

export function createPostgresIngestStore(sql: Executor): IngestStore {
  return {
    async writeSession(session, fingerprint, turns) {
      const context = {
        viewFilters: session.viewFilters,
        selectedIds: session.selectedIds,
        dateRange: session.dateRange,
        lastQuery: session.lastQuery,
        userRules: session.userRules,
        generationCancelled: session.generationCancelled,
        telemetry: session.telemetry,
      }
      // One transaction: a session must not appear without the turns that justify it.
      await sql.begin(async (tx) => {
        await tx`
          insert into sessions (
            id, org_id, agent_id, user_hash, persona_id, config_version_id,
            task_fingerprint, context, started_at, ended_at
          ) values (
            ${session.id}::uuid, ${session.orgId}::uuid, ${session.agentId}::uuid,
            ${session.userHash}, ${session.personaId ?? null}, ${session.configVersionId ?? null},
            ${fingerprint}, ${tx.json(context)}::jsonb,
            ${session.startedAt}::timestamptz, ${session.endedAt ?? null}
          )
          on conflict (id) do nothing
        `
        if (turns.length === 0) return
        const rows = turns.map((turn) => ({
          session_id: turn.sessionId,
          idx: turn.idx,
          role: turn.role,
          text_redacted: turn.textRedacted,
          tool_calls: tx.json(turn.toolCalls),
          embedding: turn.embedding === null ? null : `[${turn.embedding.join(',')}]`,
          created_at: turn.createdAt,
        }))
        await tx`
          insert into turns ${tx(rows, 'session_id', 'idx', 'role', 'text_redacted', 'tool_calls', 'embedding', 'created_at')}
          on conflict (session_id, idx) do nothing
        `
      })
    },

    async writeSignals(signals) {
      if (signals.length === 0) return
      const rows = signals.map((signal) => ({
        session_id: signal.sessionId,
        turn_idx: signal.turnIdx,
        kind: signal.kind,
        confidence: signal.confidence,
        baseline: signal.baseline,
        evidence: sql.json(signal.evidence),
        detected_at: signal.detectedAt ?? new Date().toISOString(),
      }))
      await sql`
        insert into signals ${sql(rows, 'session_id', 'turn_idx', 'kind', 'confidence', 'baseline', 'evidence', 'detected_at')}
        on conflict (session_id, turn_idx, kind) do nothing
      `
    },
  }
}
