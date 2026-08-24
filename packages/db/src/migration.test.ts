import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../../supabase/migrations/0001_init.sql", import.meta.url),
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
});
