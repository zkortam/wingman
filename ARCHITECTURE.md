# Architecture

This document defines the production boundaries for Wingman. If another document
disagrees with it, this file wins.

## 1. System posture

Wingman has two paths with deliberately different latency and authority:

1. The live path reviews one proposed tool call before the host executes it. It may
   return `ALLOW`, `RETHINK`, or `ESCALATE`, but it never calls a tool.
2. The evidence path observes completed sessions, detects repeated dissatisfaction,
   builds an assertion, proves it against multiple intercepted runs, proposes a bounded
   config change, proves the assertion passes, and only then permits rollout.

Sentiment is evidence, not authority. Frustration can explain why a turn deserves
inspection; it is never sufficient by itself to block a call or mutate configuration.

## 2. Package graph

```text
schema ───────────────┬───────────────┬──────────────┐
                     │               │              │
                    sdk              db           config
                                      │              │
                                      ├── ingest     │
                                      └──────┬───────┘
                                             │
                                          pipeline
                                             │
                                             ▼
                                         apps/web

fixtures ──► schema contracts        demo ──► sdk + schema only
```

- `packages/schema` depends only on zod and owns every cross-package wire type.
- `packages/sdk` depends only on schema and local redaction. It is the only package a
  customer's agent installs.
- `services/config` never imports pipeline. Configuration must resolve while every
  analysis component is unavailable.
- Services import from package roots only. Deep imports and cycles fail `pnpm check`.
- `apps/web` consumes config and pipeline ports; it never writes database tables
  directly.
- `fixtures` and `demo` are integration leaves. No production package imports them.

## 3. The tool boundary

The host owns execution:

```text
model proposes call
       │
       ▼
wingman.reviewToolCall()
       │
       ├── ALLOW ─────► host policy ─────► host executes
       ├── RETHINK ───► host re-prompts agent; no execution
       └── ESCALATE ──► host requests approval; no execution
```

The SDK does not accept an execution callback. Keeping execution outside the package
makes accidental tool use structurally impossible. Pipeline verification uses the
same posture: every `AgentRunner` call receives an interceptor that returns
`INTERCEPT`, and any nonzero `toolExecutions` count parks the stage.

MCP adapters may translate an MCP tool request into `reviewToolCall`, but the SDK
contract remains primary because only the host can prove it intercepted every tool.

## 4. Public SDK contracts

`Wingman.init()` returns a `WingmanClient` with five operations:

- `config({ agent, userId })`: resolves signed, locally constrained configuration.
- `reviewToolCall(input)`: returns a validated live decision within a bounded budget.
- `observeSession(input)`: queues a raw host session synchronously for local redaction.
- `rules(userId)`: returns a defensive copy of resolved user rules.
- `flush()`: drains the bounded observation queue without throwing transport errors.

The old `Outcome` and `OutcomeClient` names remain aliases during the 0.x migration;
new integrations should use `Wingman` and `WingmanClient`.

### Review failure modes

- Default `open`: return `ALLOW` with `source: FAIL_OPEN`; the host's existing policy
  remains authoritative.
- Optional `closed`: return `ESCALATE` with `source: FAIL_CLOSED`.
- Invalid model output, timeout, non-2xx response, local reviewer failure, and schema
  mismatch all use the selected fallback. None throw into host code.
- A proposed tool absent from declared config is deterministically `ESCALATE` before a
  model is called.

### Configuration resolution

```text
fresh in-memory cache
  → signed remote config (200 ms budget)
  → signed last-known-good local config
  → BASE_CONFIG compiled into the host
```

Remote and stored responses must pass `AgentConfigSchema`, safe-integer version checks,
64-byte hexadecimal signature checks, HMAC verification, writable-path comparison,
diff-byte caps, and an optional customer validator. Concurrent misses for the same
agent/user key share one request. Every caller receives a clone.

### Privacy and backpressure

- User IDs become 32-character HMAC hashes before transport.
- Session text, selected context, and tool arguments are scrubbed locally.
- The server accepts only strict `SessionInputSchema` envelopes with redaction proof.
- The queue is bounded, drops oldest first, and limits concurrent sends.
- Observation requests have a hard timeout. Failures are contained; invalid payloads
  are never sent.

## 5. Pipeline stages

The batch pipeline is:

```text
detect → cluster → gate → assert → verify-fail → fix → verify-pass → apply → confirm
```

Each stage is idempotent on `incident.key`, assertion identity, candidate ID, or event
idempotency key. Model variance is explicit: unchanged config is sampled five times;
0–1 passes is a defect, 2–4 is variance and is discarded, and 5 is a false positive.

A fix is bounded by writable paths, bytes, iterations, wall time, and a positive-suite
regression check. User-scoped apply is a pointer swap. Global apply requires operator
authority. Code defects are handed off; Wingman does not edit customer repositories in
the live path.

No pipeline failure may loop. Once an incident exists, unexpected failures transition
it to `PARKED`; policy ambiguity becomes `HUMAN_REVIEW`. Both are normal terminal
states that can be explicitly reopened on a new attempt.

## 6. Storage ownership

One service writes each table family:

- config: `orgs`, `agents`, `config_versions`, `config_overrides`
- ingest: `sessions`, `turns`, `signals`
- pipeline: `incidents`, `assertions`, `runs`, `candidates`, `outcomes`, `pipeline_handoffs`

The config service is the only mutation path for configuration. Session/event data has
finite retention; incident proofs copy the minimal redacted evidence they need so the
audit ledger survives event deletion. See [DATA-MODEL.md](DATA-MODEL.md).

## 7. Testing and release evidence

Every module has colocated unit tests. Cross-boundary implementations run shared port
contracts. The pipeline project contains integration tests for detection, variance,
fail-before/pass-after proof, user isolation, apply idempotency, confirmation, revert,
parking, and tool interception.

New behavior follows a strict sequence:

1. Add a focused test and observe it fail for the intended reason.
2. Implement the smallest production change.
3. Run the focused suite.
4. Run `pnpm check`.

`pnpm check` additionally builds `@wingman/schema` and `@wingman/sdk`, packs both,
rejects source/test/demo files in the archives, installs the tarballs in a clean
temporary consumer, and imports their public entrypoints. This verifies the artifact
users receive rather than only the monorepo source graph.

## 8. Operator product and integration environments

`apps/web` is the operator product: incident inbox, proof view, outcomes,
configuration, settings, and HTTP routes. It consumes `PipelineReader`,
`PipelineCommands`, and config-service boundaries; direct database access is forbidden.

`fixtures` supplies deterministic contract and replay evidence. `demo/amazoff` is a
mock customer that imports only the SDK and schema, while `demo/host` exercises the
complete conversation loop. These directories are part of the repository and the full
test gate, but are excluded from published SDK archives and cannot be imported by
production packages.
