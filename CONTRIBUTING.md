# Contributing

Wingman is useful when an agent host can intercept a tool call and prove a
config change. Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing
boundaries, ports, or failure modes.

## Setup

Node.js 22+ and pnpm 10:

```bash
git clone https://github.com/zkortam/wingman.git
cd wingman
pnpm install --frozen-lockfile
pnpm check
```

Run one suite:

```bash
pnpm --filter @wingman/sdk test
pnpm --filter @wingman/pipeline test
pnpm test:pipeline
```

Formatting is enforced, so run it before opening a pull request:

```bash
pnpm format          # apply
pnpm format:check    # what the gate runs
```

Coverage thresholds are enforced separately and may only move up:

```bash
pnpm coverage
```

Run one file:

```bash
pnpm --filter @wingman/sdk exec vitest run src/review.test.ts
```

The isolated demo:

```bash
pnpm demo:reset
pnpm demo:up
```

## Rules that keep the tree honest

- One language: TypeScript. Types come from `@wingman/schema` or `@wingman/db`.
- Every behavior change includes a colocated test that failed first.
- Files stay under 300 lines. Imports are from package roots.
- The SDK never executes a tool. Config never imports pipeline.
- Nothing is applied without fail-before and pass-after evidence.
- Do not regenerate deterministic cassettes in an unrelated change.
- Do not commit credentials, raw user data, or unredacted traces.

## Pull requests

Branch from `main`. Use the PR template. Explain:

1. The user-visible behavior
2. The failure mode when the model, database, or network is down
3. The command you ran (`pnpm check` is the product gate)

CI runs `pnpm check` on Linux, Windows, and macOS and on Node 22 and 24, plus a
coverage gate and `pnpm audit --audit-level high`, on every pull request and on
`main`. The gate is expected to pass on the machine you develop on: it is run on
every supported platform precisely because two release scripts were once broken
on Windows without CI noticing. `main` is protected: no force-push, no deletion, pull requests
only, and the **Product gate** check must pass on a branch that is up to date
with `main`.

## Good first issues

These are bounded and do not require changing frozen ports:

- A new thin adapter test in `packages/sdk/src/adapters.test.ts`
- Detection lexicon coverage in `services/pipeline/src/detect/`
- Operator empty-state copy that matches [UI-SPEC.md](UI-SPEC.md)
- A missing colocated test for a module that already has production code

## Compatibility

Public packages are pre-1.0 and are not on npm yet. Breaking SDK or schema
changes need a `CHANGELOG.md` note and coordinated version bumps. Frozen ports
in `packages/schema/src/ports.ts` need an architecture decision in the PR.

## Conduct

Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).
Security reports go through [SECURITY.md](SECURITY.md), never a public issue.
