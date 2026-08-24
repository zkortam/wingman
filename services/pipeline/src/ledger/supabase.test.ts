import { describe, expect, it } from "vitest";

import { SupabaseLedger } from "./supabase.js";

describe("SupabaseLedger", () => {
  it("writes and reads prior art by fingerprint", async () => {
    const inserted: unknown[] = [];
    const client = {
      from: (table: string) => {
        expect(table).toBe("pipeline_ledger");
        return {
          insert: (row: unknown) => {
            inserted.push(row);
            return Promise.resolve({ error: null });
          },
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () =>
                  Promise.resolve({
                    data: [
                      {
                        diff: { changes: [{ path: "rules", before: [], after: ["x"] }] },
                        outcome: "APPLIED",
                      },
                    ],
                    error: null,
                  }),
              }),
            }),
          }),
        };
      },
    };
    const ledger = new SupabaseLedger(client as never);
    await ledger.record({
      incidentId: "10000000-0000-4000-8000-000000000001",
      fingerprint: "fp",
      diff: { changes: [{ path: "rules", before: [], after: ["x"] }] },
      outcome: "APPLIED",
    });
    expect(inserted).toHaveLength(1);
    await expect(ledger.priorArt("fp")).resolves.toEqual([
      {
        summary: expect.any(String) as string,
        outcome: "APPLIED",
      },
    ]);
  });
});
