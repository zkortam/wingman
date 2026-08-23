import type { AgentConfig, ConfigDiff } from "./config.js";
import type { Scope } from "./enums.js";
import type {
  ConfigVersion,
  HandoffPayload,
  IncidentDetail,
  IncidentSummary,
  Outcome,
} from "./incident.js";
import type { Turn, ToolCall } from "./session.js";

export interface AgentRunner {
  runTurn(input: {
    config: AgentConfig;
    messages: Turn[];
    intercept?: (call: ToolCall) => "INTERCEPT" | "EXECUTE";
    sample?: number;
  }): Promise<{
    toolCalls: ToolCall[];
    text: string | null;
    cassetteKey: string;
    toolExecutions: number;
  }>;
}

export interface ConfigStore {
  resolve(agentId: string, userHash: string): Promise<AgentConfig>;
  base(agentId: string): Promise<AgentConfig>;
  writeVersion(
    agentId: string,
    config: AgentConfig,
    incidentId: string,
  ): Promise<ConfigVersion>;
  setOverride(
    agentId: string,
    userHash: string,
    versionId: string,
    scope: Scope,
  ): Promise<void>;
  revertOverride(agentId: string, userHash: string): Promise<void>;
  listVersions(agentId: string): Promise<ConfigVersion[]>;
  assertWritable(agentId: string, diff: ConfigDiff): Promise<void>;
}

export interface ModelClient {
  generate(request: {
    model: string;
    messages: unknown[];
    tools?: unknown[];
    sample?: number;
  }): Promise<unknown>;
}

export interface EmbeddingClient {
  embed(input: { texts: string[]; dimensions: 1536 }): Promise<number[][]>;
}

export interface PipelineReader {
  listIncidents(orgId: string): Promise<IncidentSummary[]>;
  getIncident(id: string): Promise<IncidentDetail>;
  listOutcomes(orgId: string): Promise<Outcome[]>;
  silentFailureRate(
    orgId: string,
  ): Promise<{ thisWeek: number; lastWeek: number }>;
  gatePrecision(orgId: string): Promise<{ precision: number; n: number }>;
}

export interface PipelineCommands {
  apply(
    incidentId: string,
    scope: Scope,
  ): Promise<{ outcomeId: string; versionId: string }>;
  dismiss(incidentId: string, reason: string): Promise<void>;
  reopen(incidentId: string): Promise<void>;
  handoff(incidentId: string): Promise<HandoffPayload>;
  evaluateConfirmation(
    incidentId: string,
  ): Promise<"CONFIRMED" | "REFUTED" | "UNOBSERVED">;
}

export interface Ledger {
  record(event: {
    incidentId: string;
    fingerprint: string;
    diff: ConfigDiff;
    outcome: string;
  }): Promise<void>;
  priorArt(
    fingerprint: string,
  ): Promise<Array<{ summary: string; outcome: string }>>;
}
