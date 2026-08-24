import { createHash, createHmac } from "node:crypto";

import { canonicalJSON } from "./canonical.js";
import type { AssertionDefinition } from "./assertion.js";
import type { SessionInput } from "./session.js";

export function userHash(orgSalt: string | Uint8Array, userId: string): string {
  return createHmac("sha256", orgSalt)
    .update(userId)
    .digest("hex")
    .slice(0, 32);
}

export function taskFingerprint(
  session: SessionInput,
  noToolFallback?: string,
): string | null {
  const firstCall = session.turns.flatMap(({ toolCalls }) => toolCalls).at(0);
  if (firstCall === undefined) return noToolFallback ?? null;
  const objectType =
    firstCall.args.objectType ??
    firstCall.args.object ??
    firstCall.args.type ??
    "unknown";
  return sha256(
    [session.agentId, firstCall.name, canonicalJSON(objectType)].join("|"),
  );
}

export function incidentKey(
  agentId: string,
  signalKind: string,
  fingerprint: string,
): string {
  return sha256([agentId, signalKind, fingerprint].join("|"));
}

export function assertedIncidentKey(
  bucketKey: string,
  identity: string,
): string {
  return sha256([bucketKey, identity].join("|"));
}

export function assertionIdentity(assertion: AssertionDefinition): string {
  const { kind, ...params } = assertion;
  return sha256(canonicalJSON({ kind, ...params }));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
