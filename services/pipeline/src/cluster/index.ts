import { createHash } from "node:crypto";

import {
  incidentKey,
  type EvidenceExcerpt,
  type Signal,
} from "@wingman/schema";

import type { ObservedSession } from "../domain.js";

export function clusterIdentity(
  session: ObservedSession,
  signal: Signal,
): {
  fingerprint: string;
  key: string;
} {
  const fingerprint = sessionFingerprint(session);
  return {
    fingerprint,
    key: incidentKey(session.agentId, signal.kind, fingerprint),
  };
}

export function sessionFingerprint(session: ObservedSession): string {
  return session.taskFingerprint ?? embeddingCentroidFingerprint(session);
}

export function evidenceExcerpt(
  session: ObservedSession,
  signal: Signal,
): EvidenceExcerpt {
  const target = session.turns.find(({ idx }) => idx === signal.turnIdx);
  const targetPosition =
    target === undefined
      ? session.turns.length - 1
      : session.turns.indexOf(target);
  const turns = session.turns.slice(
    Math.max(0, targetPosition - 2),
    targetPosition + 1,
  );
  return {
    sessionId: session.id,
    turnIdx: signal.turnIdx,
    kind: signal.kind,
    confidence: signal.confidence,
    baseline: signal.baseline,
    turns: turns.map(({ role, textRedacted }) => ({ role, textRedacted })),
  };
}

export function incidentTitle(session: ObservedSession): string {
  const text = [...session.turns]
    .reverse()
    .find(
      ({ role, textRedacted }) => role === "user" && textRedacted !== null,
    )?.textRedacted;
  if (text === undefined || text === null) return "Repeated agent outcome";
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length <= 80 ? compact : `${compact.slice(0, 77)}...`;
}

function embeddingCentroidFingerprint(session: ObservedSession): string {
  const vectors = session.turns.flatMap(({ embedding }) =>
    embedding === null ? [] : [embedding],
  );
  if (vectors.length === 0) {
    const text = session.turns
      .map(({ textRedacted }) => textRedacted ?? "")
      .join("|");
    return sha256(`text:${text}`);
  }
  const dimensions = vectors[0]?.length ?? 0;
  const centroid = Array.from({ length: dimensions }, (_, index) => {
    const total = vectors.reduce(
      (sum, vector) => sum + (vector[index] ?? 0),
      0,
    );
    return Math.round((total / vectors.length) * 100) / 100;
  });
  return sha256(`centroid:${centroid.join(",")}`);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
