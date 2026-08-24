import type { ServiceClient } from "@wingman/db";
import { canonicalJSON, type ConfigDiff, type Ledger } from "@wingman/schema";

export class SupabaseLedger implements Ledger {
  constructor(private readonly client: ServiceClient) {}

  async record(event: {
    incidentId: string;
    fingerprint: string;
    diff: ConfigDiff;
    outcome: string;
  }): Promise<void> {
    const { error } = await this.client.from("pipeline_ledger").insert({
      incident_id: event.incidentId,
      fingerprint: event.fingerprint,
      diff: event.diff,
      outcome: event.outcome,
    });
    if (error) throw error;
  }

  async priorArt(
    fingerprint: string,
  ): Promise<Array<{ summary: string; outcome: string }>> {
    const { data, error } = await this.client
      .from("pipeline_ledger")
      .select("diff,outcome")
      .eq("fingerprint", fingerprint)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      summary: canonicalJSON(row.diff),
      outcome: row.outcome,
    }));
  }
}
