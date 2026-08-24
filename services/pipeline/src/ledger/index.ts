import type { ConfigDiff, Ledger } from '@wingman/schema'

export class NoopLedger implements Ledger {
  record(): Promise<void> {
    return Promise.resolve()
  }

  priorArt(): Promise<Array<{ summary: string; outcome: string }>> {
    return Promise.resolve([])
  }
}

export interface MemoryAdapter {
  remember(input: {
    incidentId: string
    fingerprint: string
    diff: ConfigDiff
    outcome: string
  }): Promise<void>
  search(fingerprint: string): Promise<Array<{ summary: string; outcome: string }>>
}

export class ClaudeMemLedger implements Ledger {
  constructor(private readonly memory: MemoryAdapter) {}

  record(event: {
    incidentId: string
    fingerprint: string
    diff: ConfigDiff
    outcome: string
  }): Promise<void> {
    return this.memory.remember(event)
  }

  priorArt(fingerprint: string): Promise<Array<{ summary: string; outcome: string }>> {
    return this.memory.search(fingerprint)
  }
}

export class InMemoryLedger implements Ledger {
  private readonly records: Array<{
    incidentId: string
    fingerprint: string
    diff: ConfigDiff
    outcome: string
  }> = []

  record(event: {
    incidentId: string
    fingerprint: string
    diff: ConfigDiff
    outcome: string
  }): Promise<void> {
    if (
      !this.records.some(
        ({ incidentId, outcome }) => incidentId === event.incidentId && outcome === event.outcome,
      )
    ) {
      this.records.push(structuredClone(event))
    }
    return Promise.resolve()
  }

  priorArt(fingerprint: string): Promise<Array<{ summary: string; outcome: string }>> {
    return Promise.resolve(
      this.records
        .filter((record) => record.fingerprint === fingerprint)
        .map((record) => ({
          summary: JSON.stringify(record.diff),
          outcome: record.outcome,
        })),
    )
  }
}
