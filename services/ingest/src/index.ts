import {
  taskFingerprint,
  type EmbeddingClient,
  type EventPublisher,
  type SessionInput,
  type Signal,
} from "@wingman/schema";

import { verifyRedaction } from "./verify-redaction.js";
import type { IngestStore, StoredTurn } from "./write.js";

export interface IngestService {
  ingestEvents(payload: unknown): Promise<{ status: 202; sessionId: string }>;
  writeSignals(signals: Signal[]): Promise<void>;
}

export function createIngestService(input: {
  store: IngestStore;
  embeddings: EmbeddingClient;
  events: EventPublisher;
}): IngestService {
  return {
    async ingestEvents(payload) {
      const session = verifyRedaction(payload);
      const turns = await buildStoredTurns(session, input.embeddings);
      await input.store.writeSession(session, taskFingerprint(session), turns);
      await input.events.publish(
        "session.observed",
        { data: { sessionId: session.id } },
        session.id,
      );
      return { status: 202, sessionId: session.id };
    },
    writeSignals(signals) {
      return input.store.writeSignals(signals);
    },
  };
}

async function buildStoredTurns(
  session: SessionInput,
  embeddings: EmbeddingClient,
): Promise<StoredTurn[]> {
  const userTurns = session.turns.filter(
    (turn): turn is typeof turn & { textRedacted: string } =>
      turn.role === "user" &&
      turn.textRedacted !== null &&
      turn.textRedacted.length > 0,
  );
  const vectors =
    userTurns.length === 0
      ? []
      : await embeddings.embed({
          texts: userTurns.map(({ textRedacted }) => textRedacted),
          dimensions: 1536,
        });
  if (
    vectors.length !== userTurns.length ||
    vectors.some(({ length }) => length !== 1536)
  ) {
    throw new Error("Embedding client returned an invalid batch");
  }
  const byIndex = new Map(
    userTurns.map((turn, index) => [turn.idx, vectors[index] as number[]]),
  );
  return session.turns.map((turn) => ({
    sessionId: session.id,
    idx: turn.idx,
    role: turn.role,
    textRedacted: turn.textRedacted,
    toolCalls: turn.toolCalls,
    embedding: byIndex.get(turn.idx) ?? null,
    createdAt: turn.createdAt,
  }));
}

export {
  createSupabaseIngestStore,
  type IngestStore,
  type StoredTurn,
} from "./write.js";
export {
  RedactionVerificationError,
  verifyRedaction,
} from "./verify-redaction.js";
