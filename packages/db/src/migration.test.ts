import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../../supabase/migrations/0001_init.sql", import.meta.url),
  "utf8",
);
const handoffMigration = readFileSync(
  new URL("../../../supabase/migrations/0002_pipeline_handoffs.sql", import.meta.url),
  "utf8",
);
const incidentJoinMigration = readFileSync(
  new URL("../../../supabase/migrations/0003_atomic_incident_join.sql", import.meta.url),
  "utf8",
);

describe("initial migration invariants", () => {
  it("preserves attempts and corrected uniqueness", () => {
    expect(migration).toMatch(/attempt int not null default 1/g);
    expect(migration).toContain("unique (incident_id, attempt, iteration)");
    expect(migration).toContain("on runs (assertion_id, phase, attempt)");
  });

  it("enforces zero tool execution and deny-all RLS", () => {
    expect(migration).toContain("check (tool_executions = 0)");
    expect(migration).toContain("alter table %I enable row level security");
    expect(migration).not.toMatch(/create policy/i);
  });

  it('persists pipeline handoffs with one idempotent row per incident', () => {
    expect(handoffMigration).toContain('create table pipeline_handoffs')
    expect(handoffMigration).toMatch(/incident_id\s+uuid primary key/)
    expect(handoffMigration).toContain('enable row level security')
  })

  it('atomically creates or joins incidents and limits execution to the service role', () => {
    expect(incidentJoinMigration).toContain('on conflict (agent_id, key) do update')
    expect(incidentJoinMigration).toContain('incidents.session_ids || excluded.session_ids')
    expect(incidentJoinMigration).toContain('from public')
    expect(incidentJoinMigration).toContain('to service_role')
  })
});
