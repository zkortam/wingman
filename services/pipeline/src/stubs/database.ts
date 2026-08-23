import type {
  Assertion,
  Candidate,
  Outcome,
  Run,
  Signal,
} from "@outcome/schema";

import type {
  HandoffRecord,
  IncidentRecord,
  ObservedSession,
} from "../domain.js";

export class ReplayDatabase {
  readonly sessions = new Map<string, ObservedSession>();
  readonly signals: Signal[] = [];
  readonly incidents = new Map<string, IncidentRecord>();
  readonly assertions = new Map<string, Assertion>();
  readonly runs = new Map<string, Run>();
  readonly candidates = new Map<string, Candidate>();
  readonly outcomes = new Map<string, Outcome>();
  readonly handoffs = new Map<string, HandoffRecord>();
  readonly baseVersionIds = new Map<string, string>();
  readonly writablePolicies = new Map<
    string,
    {
      codexEndpoint: string | null;
      maxDiffBytes: number;
      writablePaths: string[];
    }
  >();
}
