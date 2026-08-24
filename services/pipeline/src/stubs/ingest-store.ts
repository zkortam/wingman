import type { IngestStore, StoredTurn } from "@wingman/ingest";
import type { SessionInput, Signal } from "@wingman/schema";

import { ReplayDatabase } from "./database.js";

export class ReplayIngestStore implements IngestStore {
  constructor(private readonly database: ReplayDatabase) {}

  writeSession(
    session: SessionInput,
    fingerprint: string | null,
    turns: StoredTurn[],
  ): Promise<void> {
    if (this.database.sessions.has(session.id)) return Promise.resolve();
    const { redaction: _redaction, turns: _turns, ...metadata } = session;
    void _redaction;
    void _turns;
    this.database.sessions.set(session.id, {
      ...metadata,
      taskFingerprint: fingerprint,
      turns: turns.map((turn) => ({
        idx: turn.idx,
        role: turn.role,
        textRedacted: turn.textRedacted,
        toolCalls: turn.toolCalls,
        embedding: turn.embedding,
        createdAt: turn.createdAt,
      })),
    });
    return Promise.resolve();
  }

  writeSignals(signals: Signal[]): Promise<void> {
    for (const signal of signals) {
      const exists = this.database.signals.some(
        ({ sessionId, turnIdx, kind }) =>
          sessionId === signal.sessionId &&
          turnIdx === signal.turnIdx &&
          kind === signal.kind,
      );
      if (!exists) this.database.signals.push(structuredClone(signal));
    }
    return Promise.resolve();
  }
}
