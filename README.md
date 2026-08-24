# Wingman

**Catch a broken agent turn and fix it in the same session.**

Most users never file a ticket. They retry, they rephrase, they leave. Wingman attaches to a live customer agent, forms an expectation from the request, and when the agent misses — cancel instead of reschedule, a capability that does not exist — it repairs the config and retries before the conversation ends.

Nothing is applied that did not fail first and pass after.

The batch pipeline is the promotion path (N=5, then global). It is not the demo.

## Demo

Amazoff is a mock store that talks to Wingman only through `@wingman/sdk`. Stevette asks to move a delivery. The agent cancels because of a policy rule its own engineers wrote. Wingman steps in; the order is reinstated on the date she asked for. `demo/` is deletable — the product does not depend on it.

```bash
git clone https://github.com/zkortam/wingman.git
cd wingman
pnpm i
pnpm demo          # http://localhost:4317
```

Uses the local Codex CLI when it is installed. `WINGMAN_MODEL=keyword` is the deterministic fallback. Hard-refresh after reset.

```
i need this to arrive aug 28     → agent cancels
no, reschedule to aug 28         → Wingman recovers
```

The same chat can track a package, leave a doorstep note, or connect her to a person. Those tools do not steal the reschedule path.

## Commands

```bash
pnpm check          # typecheck, lint, import boundaries, tests
pnpm demo           # Amazoff + Wingman, one process
pnpm demo:reset     # rebuild the fixture cohort
pnpm demo:up        # web product at /demo
pnpm test:pipeline  # replay fixture defects end to end
```

`pnpm check` is the gate. Run it before every commit.

## Layout

```
packages/schema     types, enums, ports
packages/db         generated Supabase client
packages/sdk        @wingman/sdk — the only thing a customer installs
services/ingest     receivers and redaction verification
services/config     the read path; never imports pipeline
services/pipeline   live classify / expect / repair, then the batch stages
apps/web            operator UI
demo/amazoff        mock store and support agent
demo/host           runs Amazoff and Wingman together
fixtures            cassettes and planted defects
```

`services/config` is the hard boundary. If the pipeline is down, the customer's agent must still resolve config.

## Documentation

| Doc | When |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | changing structure. Ports live here. This file wins disagreements. |
| [`DATA-MODEL.md`](DATA-MODEL.md) | database, state machine, writers |
| [`UI-SPEC.md`](UI-SPEC.md) | anything visual |
| [`DEMO.md`](DEMO.md) | fixtures and presenting |
| [`AGENTS.md`](AGENTS.md) | coding agents |

## License

[MIT](LICENSE)
