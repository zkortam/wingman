export interface Opportunity {
  id: string
  account: string
  owner: string
  stage: 'Discovery' | 'Qualified' | 'Negotiation' | 'Closed Won' | 'Closed Lost'
  amount: number
  closeDate: string
  status: 'New' | 'Active'
}

const accounts = [
  'Brightwell Foods',
  'Castellan Logistics',
  'Merrow Health',
  'Padgett Legal',
  'Northstar Materials',
  'Juniper Systems',
  'Albion Freight',
  'Calder Medical',
]

const owners = ['Amina Yusuf', 'Ben Carter', 'Clara Reyes', 'Dev Patel', 'Elena Park', 'Finn Lewis', 'Gia Chen', 'Hugo Silva']
const stages: Opportunity['stage'][] = ['Discovery', 'Qualified', 'Negotiation', 'Closed Won', 'Closed Lost']

const seededOpportunities = (): Opportunity[] =>
  Array.from({ length: 50 }, (_, index) => ({
    id: `OPP-${String(index + 1001)}`,
    account: accounts[index % accounts.length] ?? 'Ledgerline Customer',
    owner: owners[index % owners.length] ?? 'Amina Yusuf',
    stage: stages[index % stages.length] ?? 'Discovery',
    amount: 4_217 + ((index * 7_913) % 305_700),
    closeDate: new Date(Date.now() + (index - 25) * 86_400_000).toISOString().slice(0, 10),
    status: index < 3 ? 'New' : 'Active',
  }))

export class InMemoryCrm {
  readonly #opportunities: Opportunity[]
  #auditEntries = 0

  constructor(opportunities: Opportunity[] = seededOpportunities()) {
    this.#opportunities = structuredClone(opportunities)
  }

  auditCount(): number {
    return this.#auditEntries
  }

  search(filters: Record<string, unknown> = {}): Opportunity[] {
    return this.#opportunities.filter((opportunity) =>
      Object.entries(filters).every(([field, value]) => opportunity[field as keyof Opportunity] === value),
    )
  }

  export(filters: Record<string, unknown> = {}): { rowCount: number; url: string } {
    this.#auditEntries += 1
    return { rowCount: this.search(filters).length, url: '/exports/ledgerline-opportunities.csv' }
  }

  update(id: string, fields: Partial<Opportunity>): Opportunity {
    this.#auditEntries += 1
    const opportunity = this.#opportunities.find((candidate) => candidate.id === id)
    if (!opportunity) throw new Error(`Unknown opportunity: ${id}`)
    Object.assign(opportunity, fields)
    return structuredClone(opportunity)
  }
}
