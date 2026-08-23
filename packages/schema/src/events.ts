import type { Scope, Verdict } from "./enums.js";

export interface Events {
  "session.observed": { data: { sessionId: string } };
  "incident.clustered": { data: { incidentId: string } };
  "incident.classified": { data: { incidentId: string; verdict: Verdict } };
  "incident.asserted": { data: { incidentId: string; assertionId: string } };
  "candidate.ready": { data: { incidentId: string; candidateId: string } };
  "candidate.applied": {
    data: { incidentId: string; candidateId: string; scope: Scope };
  };
  "confirmation.due": { data: { incidentId: string } };
}

export type EventName = keyof Events;

export interface EventPublisher {
  publish<Name extends EventName>(
    name: Name,
    event: Events[Name],
    idempotencyKey: string,
  ): Promise<void>;
}
