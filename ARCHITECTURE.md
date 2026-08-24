# Architecture

**The contract between Engineer A (`MASTERPLAN-A.md`) and Engineer B (`MASTERPLAN-B.md`).**

Single source of truth for repo layout, module boundaries, and every interface that crosses the A/B seam. When a plan document disagrees with this file, **this file wins.**

| Companion spec | Owner | Covers |
|---|---|---|
| `DATA-MODEL.md` | A | full DDL, indexes, RLS, state machine, the four derivations, retention |
| `UI-SPEC.md` | B | tokens, components, all five screens, every incident state, keyboard, a11y |

---

## 1. The three rules that make parallel work possible

**Rule 1 — Depend on interfaces, not on each other.**
Every A↔B connection is an interface in `packages/schema/src/ports.ts`. A writes code against `AgentRunner`; B ships the class that implements it. Neither engineer imports the other's implementation, ever. Swapping a stub for the real thing is a one-line change in a composition root.

**Rule 2 — One writer per table.**
Two people writing the same row is the failure mode that eats a hackathon. `DATA-MODEL.md` §2.

**Rule 3 — Import only from a package root.**
`import { applyDiff } from '@wingman/schema'`, never `'@wingman/schema/src/config'`. Enforced by `.dependency-cruiser.cjs` in `pnpm check`.

**And the mechanical guarantee behind all three:** every port has a **contract test suite** that both the real implementation and the stub must pass (§12.2). If B's `DemoAgentRunner` and A's `StubRunner` both pass `describeAgentRunner`, the swap at checkpoint 1 cannot break A's caller. That is what "plugs in without issues" means in practice — not a promise, a test.

---

## 2. Repo tree

Every file that will exist. Owner: **A**, **B**, or **shared** (frozen at T+0:25; post-freeze edits need a 30-second sync).

```
wingman/
├── README.md                          # what it is, how to run, doc map           B
├── AGENTS.md                          # the contract coding agents read           B
├── CLAUDE.md                          # one line: see AGENTS.md                   B
├── ARCHITECTURE.md                    # this file                                 shared
├── DATA-MODEL.md                                                                  A
├── UI-SPEC.md                                                                     B
├── package.json                       # scripts only, zero runtime deps           B
├── pnpm-workspace.yaml                                                            B
├── tsconfig.base.json                 # strict: true, noUncheckedIndexedAccess    B
├── vitest.workspace.ts                                                            B
├── .dependency-cruiser.cjs            # import-boundary enforcement, §6           shared
├── .env.example                                                                   B
│
├── packages/
│   ├── schema/                        @wingman/schema   deps: zod                 A
│   │   └── src/
│   │       ├── index.ts               # THE barrel. the only public entrypoint.
│   │       ├── enums.ts               # SignalKind · AssertionKind · Verdict · Scope · IncidentState
│   │       ├── config.ts              # AgentConfig · ConfigDiff · applyDiff()
│   │       ├── session.ts             # SessionInput · Turn · ToolCall · Signal
│   │       ├── incident.ts            # Incident · Assertion · Run · Candidate · Outcome
│   │       ├── assertion.ts           # ◀── §8. kinds, params, ContextRef, evaluate()
│   │       ├── events.ts              # the typed Inngest event map, §14
│   │       ├── errors.ts              # StageError · ParkReason, §11
│   │       ├── derive.ts              # userHash · taskFingerprint · incidentKey · assertionIdentity
│   │       ├── canonical.ts           # canonicalJSON · signConfig — byte-identical both sides
│   │       ├── ports.ts               # ◀── THE SEAM. every A↔B interface.
│   │       ├── ports.contract.ts      # ◀── the suites every implementation must pass, §12.2
│   │       └── *.test.ts
│   │
│   ├── db/                            @wingman/db       deps: supabase-js, schema  A
│   │   └── src/
│   │       ├── index.ts               # createServiceClient()
│   │       └── types.gen.ts           # `pnpm db:types` output — NEVER hand-edit
│   │
│   └── sdk/                           @wingman/sdk      deps: schema, zod ONLY     B
│       └── src/
│           ├── index.ts               # Outcome.init() → { config, observe, rules, flush }
│           ├── resolve.ts             # the four-level chain, §10
│           ├── observe.ts             # bounded queue, fire-and-forget
│           ├── redact.ts              # OpenRedaction + allowlist + hashUserIds
│           ├── base-config.ts         # BASE_CONFIG — the constant compiled into their bundle
│           └── *.test.ts
│
├── services/
│   ├── ingest/                        deps: schema, db                            A
│   │   └── src/
│   │       ├── index.ts               # ingestEvents(payload) — the only export
│   │       ├── verify-redaction.ts    # reject unredacted. we never redact server-side.
│   │       └── write.ts               # sessions · turns · signals
│   │
│   ├── config/                        deps: schema, db.  NEVER pipeline.          B
│   │   └── src/
│   │       ├── index.ts               # SupabaseConfigStore implements ConfigStore
│   │       ├── resolve.ts             # read path. own SLO. fails open.
│   │       ├── mutations.ts           # writeVersion · setOverride · revertOverride
│   │       ├── cache.ts               # in-process, 5s TTL, negative caching
│   │       ├── allowlist.ts           # writable_paths + max_diff_bytes enforcement
│   │       ├── signature.ts           # sign/verify over canonicalJSON
│   │       └── *.test.ts
│   │
│   └── pipeline/                      deps: schema, db, config, fixtures          A
│       └── src/
│           ├── index.ts               # createPipelineReader() · createPipelineCommands()
│           ├── runtime.ts             # ◀── COMPOSITION ROOT. every port injected here.
│           ├── inngest.ts             # typed client from schema/events
│           ├── state.ts               # the transition table, DATA-MODEL.md §6
│           ├── functions/
│           │   ├── 01-detect.ts        02-cluster.ts      03-gate.ts
│           │   ├── 04-assert.ts        05-verify-fail.ts  06-fix.ts
│           │   ├── 07-verify-pass.ts   08-apply.ts        09-confirm.ts
│           │   ├── 10-ledger.ts        98-expiry.ts       99-retention.ts
│           ├── detect/{lexicon,baseline,conjunction}.ts
│           ├── runner/
│           │   ├── index.ts           # runAssertion(), §9
│           │   ├── intercept.ts       # 🔴 the tool boundary. executes nothing.
│           │   └── variance.ts        # 0-1 defect │ 2-4 discard │ 5 discard
│           ├── fix/{prompt,diff,bounds}.ts
│           ├── ledger/{claude-mem,writeback}.ts
│           ├── stubs/                 # delete at the checkpoints
│           │   ├── runner.ts          # AgentRunner   — until B ships one
│           │   └── config-store.ts    # ConfigStore   — until B ships one
│           └── *.test.ts
│
├── apps/web/                          deps: schema, config, pipeline              B
│   ├── app/
│   │   ├── (app)/inbox/page.tsx
│   │   ├── (app)/incidents/[id]/page.tsx
│   │   ├── (app)/outcomes/page.tsx
│   │   ├── (app)/config/page.tsx
│   │   ├── (app)/settings/page.tsx
│   │   ├── (read)/v1/config/[agent]/[userId]/route.ts   # isolated group, §15
│   │   └── api/v1/…                                     # the other nine endpoints
│   └── src/
│       ├── server/container.ts        # ◀── COMPOSITION ROOT for the web app
│       └── ui/                        # tokens.css + the 15 components, UI-SPEC.md §3
│
├── fixtures/                          @wingman/fixtures  deps: schema             B
│   ├── src/
│   │   ├── index.ts                   # DemoAgentRunner implements AgentRunner
│   │   ├── agent/{index,tools,crm}.ts
│   │   ├── cassette.ts                # recorded() — record/replay, five-response arrays
│   │   ├── personas.ts
│   │   ├── generate.ts                # pnpm fixtures:generate
│   │   └── *.test.ts                  # runs describeAgentRunner + the isolation test
│   ├── agent/config.base.json         # the thing we mutate
│   ├── agent/canned.json              # what A's stub replays before checkpoint 1
│   ├── agent/seed.sql                 # 50 opportunities, 3 with status=New
│   ├── defects/OC-00{1,2,3,4}.json
│   ├── personas/personas.json         # 8 synthetic users
│   ├── cassettes/<sha256>.json        # committed. never regenerated live.
│   ├── sessions/seeded.jsonl          # 50 pre-generated sessions
│   └── incidents/seed.json            # hand-written incident rows        ◀── A authors
│
└── supabase/
    ├── config.toml                                                                B
    └── migrations/0001_init.sql       # DATA-MODEL.md §4. append-only.            A
```

**Eight workspace packages and that is the cap.** A ninth requires deleting one.

### 2.1 Package manifests

Dependencies are part of the architecture — this is what keeps the SDK small and the boundaries real.

| Package | `dependencies` | Notes |
|---|---|---|
| `@wingman/schema` | `zod` | Nothing else, ever. It is the root of the graph. |
| `@wingman/db` | `@supabase/supabase-js`, `@wingman/schema` | |
| `@wingman/sdk` | `@wingman/schema` | **Not** supabase-js. Customers install this; every transitive dep is a reason not to. Redaction via `openredaction`, `fetch` via the platform. |
| `@wingman/fixtures` | `@wingman/schema`, `ai` (Vercel AI SDK) | Leaf. Implements ports, consumes none. |
| `services/config` | `@wingman/schema`, `@wingman/db` | |
| `services/ingest` | `@wingman/schema`, `@wingman/db` | |
| `services/pipeline` | `@wingman/schema`, `@wingman/db`, `services/config`, `@wingman/fixtures`, `inngest`, `ai`, `@openai/codex`, `claude-mem` | The only package allowed to be heavy. |
| `apps/web` | `@wingman/schema`, `services/config`, `services/pipeline`, `next`, `react`, `tailwindcss`, `@radix-ui/*` | |

---

## 3. The seam — `packages/schema/src/ports.ts`

Frozen at T+0:25.

```ts
/* ═══ B IMPLEMENTS · A CONSUMES ═══════════════════════════════════ */

/** How the pipeline exercises the customer's agent. The runner NEVER executes a tool call. */
export interface AgentRunner {
  runTurn(input: {
    config: AgentConfig
    messages: Turn[]
    /** 'INTERCEPT' = record the decision, do not execute.
     *  The pipeline runner ALWAYS passes () => 'INTERCEPT'. Omitted only on the demo path. */
    intercept?: (call: ToolCall) => 'INTERCEPT' | 'EXECUTE'
    /** Sample index 0..n-1. Under replay, selects responses[i] from the cassette,
     *  which is what preserves genuine variance through the gate. */
    sample?: number
  }): Promise<{
    toolCalls: ToolCall[]
    text: string | null
    cassetteKey: string
    /** Must be 0 whenever intercept returned 'INTERCEPT'. Persisted, and Postgres
     *  CHECKs it — see DATA-MODEL.md §4, table `runs`. */
    toolExecutions: number
  }>
}

/** The read+write path for config. The ONLY way anything mutates a config table. */
export interface ConfigStore {
  resolve(agentId: string, userHash: string): Promise<AgentConfig>          // must fail open
  base(agentId: string): Promise<AgentConfig>
  writeVersion(agentId: string, cfg: AgentConfig, incidentId: string): Promise<ConfigVersion>
  setOverride(agentId: string, userHash: string, versionId: string, scope: Scope): Promise<void>
  revertOverride(agentId: string, userHash: string): Promise<void>
  listVersions(agentId: string): Promise<ConfigVersion[]>
  /** Throws PathNotWritable / DiffTooLarge. Called before any candidate is persisted. */
  assertWritable(agentId: string, diff: ConfigDiff): Promise<void>
}

/** Deterministic model access. Replay pops five recorded responses in order. */
export interface ModelClient {
  generate(req: { model: string; messages: unknown[]; tools?: unknown[]; sample?: number }): Promise<unknown>
}

/* ═══ A IMPLEMENTS · B CONSUMES ═══════════════════════════════════ */

/** Everything the UI reads. apps/web NEVER queries incident tables directly. */
export interface PipelineReader {
  listIncidents(orgId: string): Promise<IncidentSummary[]>
  getIncident(id: string): Promise<IncidentDetail>       // evidence · verdict · assertion · runs · diff
  listOutcomes(orgId: string): Promise<Outcome[]>
  silentFailureRate(orgId: string): Promise<{ thisWeek: number; lastWeek: number }>
  gatePrecision(orgId: string): Promise<{ precision: number; n: number }>
}

/** Everything the UI does. apps/web NEVER writes incident tables directly. */
export interface PipelineCommands {
  apply(incidentId: string, scope: Scope): Promise<{ outcomeId: string; versionId: string }>
  dismiss(incidentId: string, reason: string): Promise<void>
  reopen(incidentId: string): Promise<void>
  handoff(incidentId: string): Promise<HandoffPayload>
  evaluateConfirmation(incidentId: string): Promise<'CONFIRMED' | 'REFUTED' | 'UNOBSERVED'>
}

/** Ledger. A implements over claude-mem; a no-op impl is a legal fallback. */
export interface Ledger {
  record(e: { incidentId: string; fingerprint: string; diff: ConfigDiff; outcome: string }): Promise<void>
  priorArt(fingerprint: string): Promise<Array<{ summary: string; outcome: string }>>
}
```

**Why this shape.** A never imports `@wingman/fixtures` types — it depends on `AgentRunner`, so B can rewrite the demo agent entirely without A recompiling a line of logic. B never imports pipeline internals — it depends on `PipelineReader`/`PipelineCommands`, so A can restructure every stage without touching the UI. Stubs are just other implementations.

---

## 4. Composition roots

Exactly two places construct a dependency. Nowhere else calls `new`.

```ts
// services/pipeline/src/runtime.ts        — A owns
export function createRuntime(o: Partial<Runtime> = {}): Runtime {
  return {
    runner:      o.runner      ?? (process.env.RUNNER === 'stub' ? new StubRunner() : new DemoAgentRunner()),
    configStore: o.configStore ?? new SupabaseConfigStore(),
    ledger:      o.ledger      ?? (process.env.LEDGER === 'off' ? new NoopLedger() : new ClaudeMemLedger()),
  }
}
```

```ts
// apps/web/src/server/container.ts        — B owns
export const reader   = createPipelineReader()
export const commands = createPipelineCommands()
export const config   = new SupabaseConfigStore()
```

Checkpoint 1 is `RUNNER=stub` → `RUNNER=demo`. Checkpoint 2 is deleting the seed loader from `container.ts`. **If a checkpoint turns into a refactor, the port was wrong — fix the port, not the callers.** Every test injects fakes through the same constructors: no mocking framework, no module patching.

---

## 5. Dependency graph

```
                    ┌──────────────┐
                    │    schema    │  zod only. depends on nothing.
                    └──────┬───────┘
          ┌────────────────┼─────────────────┬───────────────┐
          ▼                ▼                 ▼               ▼
      ┌───────┐        ┌──────┐        ┌──────────┐    ┌──────────┐
      │  sdk  │        │  db  │        │ fixtures │    │  config  │
      └───────┘        └──┬───┘        └────┬─────┘    └────┬─────┘
      (customer)          │                 │               │
                          ├─────────────────┴───────────────┤
                          ▼                                 ▼
                    ┌──────────┐                     ┌────────────┐
                    │  ingest  │                     │  pipeline  │
                    └──────────┘                     └─────┬──────┘
                                                           ▼
                                                     ┌──────────┐
                                                     │   web    │
                                                     └──────────┘
```

## 6. Boundary enforcement

```js
// .dependency-cruiser.cjs — part of `pnpm check`
module.exports = { forbidden: [
  { name: 'config-not-pipeline', severity: 'error',
    comment: 'THE hard boundary. If the pipeline is broken, config must still resolve.',
    from: { path: '^services/config' }, to: { path: '^services/pipeline' } },

  { name: 'sdk-schema-only', severity: 'error',
    comment: 'Customers install the SDK. Every transitive dep is a reason not to.',
    from: { path: '^packages/sdk' },
    to: { pathNot: '^(packages/sdk|packages/schema|node_modules)' } },

  { name: 'schema-is-leaf', severity: 'error',
    from: { path: '^packages/schema' },
    to: { path: '^(packages|services|apps|fixtures)', pathNot: '^packages/schema' } },

  { name: 'web-no-db', severity: 'error',
    comment: 'The UI reads through PipelineReader, never raw SQL.',
    from: { path: '^apps/web' }, to: { path: '^packages/db' } },

  { name: 'fixtures-is-leaf', severity: 'error',
    from: { path: '^fixtures' }, to: { path: '^(services|apps)' } },

  { name: 'no-deep-imports', severity: 'error',
    from: {}, to: { path: '^(packages|services)/[^/]+/src/.+' } },

  { name: 'no-cycles', severity: 'error', from: {}, to: { circular: true } },
]}
```

**If `pnpm check` fails on a boundary rule, the fix is never to relax the rule.** It is to move the code, or to add a port.

---

## 7. Data flow, end to end

```
CUSTOMER APP
  │
  ├─ outcome.config(userId) ──────────► resolved config       [SYNC, fails open, §10]
  │        ▲
  │        │ (the loop closes here)
  └─ outcome.observe(session) ────────► redact in-process     [ASYNC, never blocks]
                                             │
                                        POST /v1/events        services/ingest
                                             │                 verify redaction, write, 202
                                             ▼
  ┌──────────────────────────── INNGEST ──────────────────────────────────────┐
  │  1 DETECT      3 signals · per-user baseline · conjunction required        │
  │  2 CLUSTER     upsert on incidentKey (recall-oriented)                     │
  │  3 GATE        4 verdicts │ VARIANCE→discard │ ambiguous→HUMAN_REVIEW      │
  │  4 ASSERT      3 kinds, schema-validated  ◄── becomes the true cluster key │
  │  5 VERIFY-FAIL N=5 at the TOOL BOUNDARY, executes nothing        §9        │
  │                0-1 pass → defect │ 2-4 → flaky, discard │ 5 → wrong read   │
  │  6 FIX         @openai/codex, allowlisted paths only, ≤3 iterations        │
  │  7 VERIFY-PASS ≥4/5 must pass + full positive suite green                  │
  │  8 APPLY       USER auto │ GLOBAL human. Signed, versioned, revertible.    │
  │  9 CONFIRM     CONFIRMED │ REFUTED→revert │ UNOBSERVED→keep                │
  │ 10 LEDGER      claude-mem + AGENTS.md writeback                            │
  └───────────────────────────────────────────────────────────────────────────┘
```

Stages 8 and 9 are the only ones that cross into B's code, and they do it through `ConfigStore` — a port, not an import of a module.

---

## 8. Assertion semantics

`packages/schema/src/assertion.ts`. This is the most load-bearing type in the system: it is the deterministic test over a nondeterministic agent, and it is the reason a single user's outcome is provable.

```ts
export const ContextPath = z.enum([              // capped. the LLM cannot invent a reference.
  'session.viewFilters',
  'session.selectedIds',
  'session.dateRange',
  'session.lastQuery',
  'user.rules',
])
export const ContextRef = z.object({ $ref: ContextPath })

export const Assertion = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('TOOL_CALLED'),
             tool: z.string() }),
  z.object({ kind: z.literal('TOOL_ARG_EQUALS'),
             tool: z.string(),
             arg: z.string(),                    // dot path within the call's args
             expected: z.union([JsonLiteral, ContextRef]) }),
  z.object({ kind: z.literal('OUTPUT_MATCHES_RULE'),   // post-MVP
             rule: z.string() }),
])
```

**Evaluation** — against the agent's **decision**, never against a tool result:

| Kind | Evaluation |
|---|---|
| `TOOL_CALLED` | `decision.toolCalls.some(c => c.name === tool)` |
| `TOOL_ARG_EQUALS` | `equal(get(call.args, arg), resolve(expected, ctx))` |
| `OUTPUT_MATCHES_RULE` | one small-model judge call returning a boolean |

`equal` is deep equality, **order-insensitive for arrays of primitives**. `filters: ['status','owner']` and `['owner','status']` are the same filter set, and an assertion that fails on ordering would be flaky for reasons that have nothing to do with the defect.

**Two validation rules, enforced at generation time, not at review time:**

1. **Schema-valid or park.** An assertion that does not parse — unknown kind, unknown `$ref`, missing param — parks the incident. Three attempts, then `PARKED` with `SCHEMA_INVALID`. It never retries into a loop.
2. **Decidable from the decision alone.** `isDecidableAtToolBoundary(assertion)` rejects anything that would need a tool to have run. This is what keeps all three MVP kinds checkable without side effects, and it is the property that makes N=5 cheap.

**The assertion is the true cluster key.** `assertionIdentity(kind, params)` (`DATA-MODEL.md` §7) is unique per agent. A new session whose assertion identity differs spawns its own incident. Fingerprint buckets; identity identifies.

**Polarity.** `positive` assertions are mined from **successful** sessions at onboarding and form the regression net that exists before incident #1. `negative` assertions come from failures. Stage 7 runs the entire positive suite against every candidate — which is what stops prompt edits from being whack-a-mole.

---

## 9. The runner

`services/pipeline/src/runner/`. 🔴 **Intercept at the tool boundary. Execute nothing.**

```
agent reasons → decides call export_records(filters: [])
                            │
                  RUNNER INTERCEPTS HERE ◄── assertion evaluated
                            │
                        ✗ never executed
```

```ts
async function runAssertion(a: Assertion, cfg: AgentConfig, ctx: RunContext, n = 5) {
  const results = await Promise.all(
    range(n).map(i => runner.runTurn({
      config: cfg, messages: ctx.messages,
      intercept: () => 'INTERCEPT',      // always. no branch, no flag, no exception.
      sample: i,                          // replay pops responses[i]
    }))
  )
  const passed = results.map(r => evaluate(a, r, ctx))
  return {
    n, passCount: passed.filter(Boolean).length,
    toolExecutions: sum(results.map(r => r.toolExecutions)),   // must be 0; Postgres CHECKs it
    results,
  }
}
```

**Why interception rather than a sandbox.** Re-running against a live agent would mean the export tool actually exports and the refund tool actually refunds — five times, in production. Because all three MVP assertion kinds are checkable against the decision, three things follow: zero side effects, each run is **one model call** instead of a full agent loop (cost drops ~10×), and N=5 becomes cheap. This is also why Modal is not on the critical path: there is no untrusted code to sandbox.

**Classification — the variance gate:**

| passCount | Conclusion | Action |
|---|---|---|
| `≤ 1` | consistent failure — a defect | proceed to fix |
| `2 – 4` | intermittent — model variance | **discard silently** |
| `5` | the assertion passes — our read was wrong | **discard silently** |

**Why N=5.** With a truly broken agent (pass probability ≤ 0.1) you see ≤1 pass **92%** of the time. With a coin-flip agent (p = 0.5) you see ≤1 pass only **19%** of the time. With a working agent (p ≥ 0.95) you see 5/5 **77%** of the time. Five samples separate "broken" from "flaky" well enough to act on, at five model calls. It is hypothesis testing on a stochastic system with a deliberately tiny sample, and the middle band is **discarded rather than adjudicated** — which is the honest thing to do and also the precision story.

**Independence of samples.** Under `MODE=record`, five real calls at non-zero temperature. Under `MODE=replay`, the cassette stores an array of five recorded responses per key and `sample: i` pops the i-th. **If replay returns the same response five times the gate is theatre** — the `describeAgentRunner` contract test asserts five distinct decisions for a variance key, so this cannot regress silently.

**Verify-pass** is the same function against `applyDiff(base, candidate.diff)`, requiring **≥4/5**, plus the full positive suite green. A candidate that fixes one thing and breaks two is rejected.

---

## 10. Config resolution

Two layers. The service (`DATA-MODEL.md` §5) resolves three DB-visible levels. The SDK wraps it in four, and **cannot fail**:

```
1. in-proc cache, 5s TTL                        hit → return
2. GET /v1/config/:agent/:userId, 200ms timeout 2xx → verify signature → cache → persist LKG → return
                                                else → level 3
3. last-known-good on disk                      (skipped on serverless: no writable fs guaranteed)
4. BASE_CONFIG — a constant compiled into their bundle
```

- **`config()` returns base config on any error. Fail open, always.** If our platform is entirely offline their agent behaves exactly as it did before they installed us. We are on the value path, never the critical path.
- **200ms hard timeout**, then fall through. Never a retry on the read path — a retry is latency the customer's user pays for.
- **Negative caching:** a failed resolve caches the fallback for the same 5s, so a platform outage produces one request per process per 5s, not a storm.
- **Signature verified in their process** against `canonicalJSON` (`DATA-MODEL.md` §8). Unsigned or mismatched → base config. A serialisation mismatch between the two implementations would silently disable the product, which is why the canonical-JSON contract test is in `pnpm check`.
- **The 5s TTL is the maximum lag between an apply and the user seeing it.** That is what makes same-session recovery real, and it is the number behind demo beat 9.

`observe()` is the opposite discipline: fire-and-forget, bounded queue, drop-oldest, **never blocks, never throws into host code, < 1ms**.

---

## 11. Errors, retries, and parking

```ts
export type ParkReason =
  | 'LLM_UNAVAILABLE' | 'SCHEMA_INVALID'   | 'DIFF_TOO_LARGE'
  | 'PATH_NOT_WRITABLE' | 'ITERATIONS_EXHAUSTED' | 'SUITE_REGRESSED'
  | 'NOT_ISOLATABLE'  | 'POLICY_CONFLICT'  | 'CAP_EXCEEDED'

export class StageError extends Error {
  constructor(readonly stage: string, readonly reason: ParkReason, readonly retryable: boolean) {}
}
```

**No stage throws upward.** Every stage catches, records a state transition, and returns. Retryable errors get Inngest's 3 attempts with exponential backoff; then `PARKED` with the reason, visible in the UI (`UI-SPEC.md` §6.1). Non-retryable errors park immediately.

**Every cap ends in `PARKED`, never a loop.** Fix agent iterations ≤ 3. Assertion generation attempts ≤ 3. Per-agent in-flight incidents ≤ 3, beyond which new incidents queue rather than fan out.

| Failure | Blast radius | Handling |
|---|---|---|
| Ingest down | none | SDK buffers to a bounded queue, drops oldest, host unaffected |
| Config store unreachable | none | resolver returns base config |
| Detector crashes | none | signal dropped, logged |
| LLM call fails | one incident | retry ×3 with backoff, then `PARKED` |
| Assertion gen returns junk | one incident | schema validation rejects, park |
| Fix agent produces broken config | none | stage 7 rejects, nothing applied |
| Candidate regresses the suite | none | rejected at stage 7 |
| Applied fix doesn't help | one user | stage 9 reverts on `REFUTED` |
| Cascading incidents | throughput | per-agent cap of 3 in-flight |

**`PARKED` and `HUMAN_REVIEW` are normal outcomes, not errors.** The UI treats them as first-class views and the demo scripts them as features.

---

## 12. Testing

### 12.1 Four tiers

| Tier | What | Command |
|---|---|---|
| **Unit** | pure functions, colocated `*.test.ts` | `pnpm test` |
| **Port contract** | every implementation of every port, §12.2 | `pnpm test` |
| **Integration** | pipeline stages against real Supabase + replayed cassettes | `pnpm test` |
| **Fixture replay** | all four defects end to end | `pnpm test:pipeline` |

### 12.2 Port contract suites — the mechanism that makes the seam safe

`packages/schema/src/ports.contract.ts` exports a suite per port. **Every implementation runs it, including the stubs.**

```ts
export function describeAgentRunner(name: string, make: () => AgentRunner) {
  describe(name, () => {
    it('executes nothing when intercept returns INTERCEPT', async () => {
      const r = await make().runTurn({ config, messages, intercept: () => 'INTERCEPT' })
      expect(r.toolExecutions).toBe(0)
    })
    it('returns a stable cassetteKey for identical input', …)
    it('yields five distinct decisions across sample 0..4 for a variance key', …)
    it('never throws on a malformed config; falls back to base', …)
  })
}
```

```
fixtures/src/index.test.ts                  → describeAgentRunner('DemoAgentRunner', …)
services/pipeline/src/stubs/runner.test.ts  → describeAgentRunner('StubRunner', …)
services/config/src/index.test.ts           → describeConfigStore('SupabaseConfigStore', …)
services/pipeline/src/stubs/config-store.test.ts → describeConfigStore('InMemoryConfigStore', …)
```

If both sides of a port pass the same suite, the checkpoint swap **cannot** break the caller. That is the difference between "we agreed on an interface" and "the interface is verified."

### 12.3 `pnpm test:pipeline` — asserts per fixture defect

- the correct signal fired
- the verdict matches `expected.verdict`
- the assertion kind matches
- the variance gate reached the right conclusion
- the config after apply satisfies the assertion
- **the control user's resolved config is byte-identical to before**

That last one is the most important test in the codebase — §17.

### 12.4 Gate precision, measured with zero hand labelling

```
precision = (incidents where the assertion actually failed) / (incidents reaching the assertion stage)
```

A SQL view, surfaced in Settings, computed on every run. **Publish the number.** No competitor can report a self-measured precision figure, because none of them has a deterministic check on their own judgments.

---

## 13. Observability

- **One structured log line per stage**, always carrying `incidentId · stage · outcome · durationMs`. Grep by incident id and you have the whole story.
- **Inngest step names are the stage names** — `detect`, `cluster`, `gate` … They are the execution trace, and named steps are highly legible to a coding agent working on this repo.
- **No APM, no tracing vendor.** Four services total. We are the thing that tells you what happened.

**Performance budgets, and where each is measured:**

| Metric | Budget | Measured in |
|---|---|---|
| SDK `observe()` overhead | < 1ms, non-blocking | `packages/sdk/src/observe.test.ts` |
| SDK `config()` p99 | < 50ms cold, < 1ms cached | `services/config/src/resolve.test.ts` |
| Config staleness after apply | ≤ 5s | the cache TTL, asserted in the isolation test |
| Incident detection → inbox | < 60s | `pnpm test:pipeline` |
| Full loop, detect → confirmed | < 5 min for an active user | rehearsal |
| `demo:reset` | < 30s | CI timing assertion |
| Cold clone → populated inbox | < 2 min | rehearsal |

---

## 14. Events

Typed Inngest map in `packages/schema/src/events.ts`. This is the *other* way A and B connect — asynchronously, with no import at all.

```ts
export type Events = {
  'session.observed':    { data: { sessionId: string } }                        // ingest → detect
  'incident.clustered':  { data: { incidentId: string } }                       // cluster → gate
  'incident.classified': { data: { incidentId: string; verdict: Verdict } }     // gate → assert
  'incident.asserted':   { data: { incidentId: string; assertionId: string } }  // assert → verify-fail
  'candidate.ready':     { data: { incidentId: string; candidateId: string } }  // fix → verify-pass
  'candidate.applied':   { data: { incidentId: string; candidateId: string; scope: Scope } }
  'confirmation.due':    { data: { incidentId: string } }                       // scheduled → confirm
}
```

B's apply route emits `candidate.applied`; A's confirmation stage consumes it. B never calls A's confirm function — which keeps the lanes decoupled at runtime, not just at compile time.

**Every consumer is idempotent on `incidentKey` or `candidate.id`.** Inngest will redeliver; assume it. The uniqueness constraints in `DATA-MODEL.md` §4 are what make that free.

---

## 15. HTTP

Ten endpoints. An eleventh means something is wrong with the model.

| Method | Path | Implemented by | Calls |
|---|---|---|---|
| POST | `/v1/events` | **A** | `ingestEvents()` |
| GET | `/v1/config/:agent/:userId` | **B** | `ConfigStore.resolve()` |
| GET | `/v1/incidents` | **B** route | `PipelineReader.listIncidents()` |
| GET | `/v1/incidents/:id` | **B** route | `PipelineReader.getIncident()` |
| POST | `/v1/incidents/:id/apply` | **B** route | `PipelineCommands.apply()` |
| POST | `/v1/incidents/:id/dismiss` | **B** route | `PipelineCommands.dismiss()` |
| POST | `/v1/incidents/:id/handoff` | **B** route | `PipelineCommands.handoff()` |
| GET | `/v1/outcomes` | **B** route | `PipelineReader.listOutcomes()` |
| GET | `/v1/config/:agent/versions` | **B** | `ConfigStore.listVersions()` |
| POST | `/v1/config/:agent/revert` | **B** | `ConfigStore.revertOverride()` |

**`GET /v1/config/:agent/:userId` lives in its own route group `(read)` with no shared middleware, no auth helper, no logging wrapper.** It is the one path that must survive everything else being down, and every piece of shared code it touches is a way for the rest of the system to take it out.

---

## 16. Security

| Control | Mechanism | Enforced in |
|---|---|---|
| **Field allowlist** | customer declares writable config paths | the **SDK, client-side** — rejected before it leaves their process — *and* the fix agent's prompt *and* `writeVersion` |
| **Diff cap** | hard byte limit; exceeding it forces human approval regardless of scope | `services/config/src/allowlist.ts` |
| **Customer validator** | optional `validate(config)` hook running in **their** process | `@wingman/sdk` |
| **Signed versions** | HMAC over canonical JSON; SDK rejects mismatches and falls back to base | `signature.ts` + SDK |
| **External audit trail** | `AGENTS.md` writeback puts every confirmed change in **their** git history | `pipeline/ledger/writeback.ts` |
| **No identities stored** | per-org salted HMAC user hash, computed client-side | `derive.ts` + SDK |
| **Redaction** | allowlist + OpenRedaction, local and offline; the server **rejects** unredacted payloads | `sdk/redact.ts`, `ingest/verify-redaction.ts` |
| **RLS** | enabled, deny-all; all access is server-side via the service role | `DATA-MODEL.md` §4 |

**We never redact server-side.** Redacting on our side would mean we received the PII. The ingest endpoint's job is to *verify* redaction happened and reject the payload otherwise.

The audit-trail control is the one that ends the security conversation: **their audit log does not live on our infrastructure.**

---

## 17. The isolation guarantee

The most important test in the codebase, and it spans both lanes:

```ts
// fixtures/src/isolation.test.ts — B writes it, A must keep it green
test('control user config is byte-identical after a USER-scope apply', async () => {
  const before = await store.resolve('support', CONTROL_USER)
  await commands.apply(incidentId, 'USER')                  // applies to REPORTER only
  const after  = await store.resolve('support', CONTROL_USER)
  expect(canonicalJSON(after)).toBe(canonicalJSON(before))
})
```

Same code, same deploy, different config row. This is demo beat 10 and the product's entire claim. **If it goes red, stop whatever else you are doing.**

---

## 18. Environment

```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
OPENAI_API_KEY=            # only needed with MODE=record
MODE=replay                # replay | record        ← default replay, always
RUNNER=demo                # demo | stub           ← stub until checkpoint 1
LEDGER=on                  # on | off
CODEX_ENDPOINT=            # the customer's Codex App-Server, CODE_DEFECT path only
```

**`MODE=replay` is the default and the demo runs on it.** An unknown cassette key in replay throws loudly at boot, never mid-demo. In replay the repo needs zero API keys — that is the "cold clone to populated inbox in under two minutes" guarantee, and it is also why conference wifi cannot end the demo.

## 19. Commands

```bash
pnpm check          # typecheck + lint + dependency-cruiser + contrast + vitest + pipeline fixtures
pnpm dev            # web + inngest dev server
pnpm demo:reset     # drop db, migrate, seed, load cassettes, replay 50 sessions   (< 30s)
pnpm demo:up        # demo agent + platform + web, two browser windows
pnpm test:pipeline  # replays every fixture defect end to end
pnpm db:types       # supabase gen types typescript > packages/db/src/types.gen.ts
pnpm fixtures:generate --defect OC-001 --sessions 50 --hit-rate 0.24
```

`pnpm check` is the single ground-truth signal. Green check + green boundaries = your half plugs into the other half.

## 20. Conventions

- One language: TypeScript. **No Python in this repo.**
- Types come from `@wingman/schema` (zod) and `@wingman/db` codegen. **Never hand-write a type that exists there.**
- Every module has a colocated `*.test.ts`.
- **Files stay under 300 lines.** Split rather than grow.
- No metaprogramming, no decorators, no dynamic imports, no clever abstractions.
- Named exports only. One barrel per package.
- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.

---

## 21. Integration checkpoints

| When | What changes | Duration |
|---|---|---|
| **T+0:25** | schema, ports, contract suites, migration, scaffold merged. **Contract frozen.** Both stubs committed. | — |
| **T+1:15** | B's `DemoAgentRunner` lands and passes `describeAgentRunner`. A sets `RUNNER=demo`, deletes `stubs/runner.ts`. | 10 min |
| **T+2:15** | A's `PipelineReader` lands. B deletes the seed loader from `container.ts`. A's auto-apply calls the real `SupabaseConfigStore`. | 15 min |
| **T+2:45** | Full loop: seeded session → incident → gate → assert → 0/5 → fix → 5/5 → apply → confirm. | 30 min |
| **T+3:15** | `pnpm test:pipeline` green on all four fixture defects. Rehearse three clean runs. | 30 min |

---

## 22. Decisions, and what would change our mind

| # | Decision | Rationale | What would reverse it |
|---|---|---|---|
| 1 | **Tool-boundary interception, not a sandbox** | No untrusted code, so no sandbox needed. Zero side effects, ~10× cheaper, N=5 becomes affordable. | An assertion kind that genuinely requires execution — then Modal moves onto the critical path. |
| 2 | **N = 5** | Separates p≤0.1 from p=0.5 at 92% / 19%. Five model calls. | Observed gate precision below 80% with a clear variance cause. |
| 3 | **Assert on invariants, never text** | The agent answers differently every run; text assertions are flaky by construction. | Nothing. This is the product. |
| 4 | **`services/config` cannot import `services/pipeline`** | If the pipeline is broken the customer's agent must still resolve config. | Nothing. |
| 5 | **Ports + two composition roots** | Two engineers, zero coupling, one-line checkpoint swaps, contract-tested. | A third engineer joining — then split by port, not by layer. |
| 6 | **Full configs in `config_versions`, not diffs** | Revert becomes a pointer swap and resolution is one read. | Config size reaching megabytes. |
| 7 | **Supabase over Firebase/Neon/raw PG** | Relational fits incidents and config; auth, pgvector, realtime, and generated TS types included. | Needing self-hosting for a design partner. |
| 8 | **Cassettes with five-response arrays** | Byte-deterministic demo *and* a real variance gate under replay. | Nothing before demo day. |
| 9 | **No native pg enums** | We will change these lists during the build; zod is the source of truth anyway. | Schema stability plus a measured index win. |
| 10 | **`tool_executions = 0` as a DB CHECK** | The 🔴 invariant fails at write time rather than review time. | Nothing. |
| 11 | **Inbox, not dashboard** | One object, one action. A screen that doesn't help decide about an incident doesn't ship. | A design partner who needs reporting before they need decisions. |
| 12 | **Revert on `REFUTED` only, never on `UNOBSERVED`** | Absence of evidence is not evidence of failure; a monthly-task user would lose a working fix. | Nothing. |
