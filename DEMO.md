# Demo

Two isolated environments. Neither is production traffic.

| Command | What it is |
|---|---|
| `pnpm demo:up` | Operator console (`WINGMAN_RUNTIME=demo`). Inbox and `/demo` use the staged Ledgerline cohort. |
| `pnpm demo` | Amazoff support host at `http://localhost:4317`. Live FIX-lane recovery in-process. |
| `pnpm demo:reset` | Rebuilds fixtures. Does not require API keys in replay mode. |

Production never falls back to these seeds when credentials are missing.

## Fixtures

`fixtures/defects/OC-00{1,2,3,4}.json` are config mutations the pipeline must classify:

| Defect | Expected verdict |
|---|---|
| OC-001 | `CONFIG_DEFECT` |
| OC-002 | `PREFERENCE` |
| OC-003 | `VARIANCE` (discard) |
| OC-004 | `CODE_DEFECT` (handoff) |

Cassettes in `fixtures/cassettes/` are immutable replay evidence. Default `MODE=replay` never hits the network. An unknown cassette key throws at boot.

```bash
pnpm demo:reset
pnpm test:pipeline
```

Do not regenerate cassettes as part of an unrelated change.
