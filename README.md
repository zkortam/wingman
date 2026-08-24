# Outcome

**Proof your agent actually worked for the user.**

Under 3% of users ever report a failure; the rest give up silently. Outcome detects failed outcomes from what users **do**, turns each one into a test that provably fails against the live agent, fixes it, proves the test now passes, ships the fix to only the affected users, and confirms their exact task now succeeds.

> **The one invariant:** nothing is ever applied that did not demonstrably fail first and pass after.

Monitoring tools can see a problem but never prove a fix caused the improvement. Rollout tools need thousands of users before they can say anything at all. Outcome holds the test and the serving path in the same place, which is why it can prove a specific change made a specific user's task succeed.

---

## Quickstart

```bash
git clone git@github.com:zkortam/wingman.git && cd wingman
pnpm i
pnpm demo:reset        # < 30s. validates the committed 50-session cohort offline.
pnpm demo:up           # starts the product and opens the two-window harness.
```

Cold clone to a populated inbox in under two minutes with no API keys. After dependencies are installed, replay and reset make no network calls. **If that stops being true, fix it before writing another feature.**

## Commands

```bash
pnpm check          # typecheck + lint + import boundaries + contrast + tests + pipeline fixtures
pnpm dev            # Next.js product and API surface
pnpm demo:reset     # validates 50 sessions / 12 affected; replays when WINGMAN_API_URL is set
pnpm demo:up        # starts the web product and opens /demo
pnpm test:pipeline  # replays every fixture defect end to end
```

`pnpm check` is the single ground-truth signal. Run it before every commit.

## Documentation

| Doc | Read it when |
|---|---|
| **`ARCHITECTURE.md`** | before your first commit. Ports, boundaries, composition roots, testing, error model. **It wins any disagreement.** |
| `DATA-MODEL.md` | touching the database, the state machine, or any of the four derivations |
| `UI-SPEC.md` | touching anything visual: tokens, components, screens, every incident state, keyboard, a11y |
| `DEMO.md` | building fixtures, mock data, cassettes, or preparing to present |
| `AGENTS.md` | you are a coding agent, or you are configuring one |

Execution plans (`MASTERPLAN-A.md`, `MASTERPLAN-B.md`) are held locally and are not committed.

## Layout

```
packages/schema     zod types, enums, ports; the single source of truth
packages/db         typed Supabase client (generated, never hand-edited)
packages/sdk        @wingman/sdk; the only thing customers install
services/ingest     OTLP + native receiver, redaction verification
services/config     the read path. own SLO. imports nothing from pipeline. ever.
services/pipeline   the ten Inngest stages
apps/web            Next.js; five screens, hosts the API routes
fixtures            demo agent, planted defects, personas, cassettes
supabase/migrations schema is code
```

`services/config` is the one hard architectural boundary. **If the pipeline is broken, the customer's agent must still resolve config.**

## Status

Hackathon build. Path B owns the SDK, config service, fixtures, API surface, and customer-visible product. Path A supplies the schema, database, ingest, and pipeline ports at the integration seam in `ARCHITECTURE.md`, section 21.

Not built, deliberately: auth, multi-tenancy, dashboards, framework adapters beyond the native receiver, or styling beyond the five specified screens.
