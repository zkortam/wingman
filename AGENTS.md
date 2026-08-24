# AGENTS.md

## Commands

pnpm check # full product gate. Run before every commit.
pnpm demo:reset # rebuild the integration environment (< 30s)
pnpm demo:up # start agent + platform + web
pnpm package:check # pack and import the public SDK as a clean consumer

## Invariants

- Nothing is applied that did not demonstrably fail first and pass after.
- The runner NEVER executes tool calls. It intercepts at the tool boundary.
- services/config may not import from services/pipeline. Ever.
- Config resolution must fail open to BASE_CONFIG.
- Every stage is idempotent on incidentKey or candidate.id.
- No stage throws upward. Every cap ends in PARKED, never a loop.

## Conventions

- One language: TypeScript. No Python in this repo.
- Types come from packages/schema (zod) and packages/db codegen. Never hand-write a type that exists there.
- Import from package roots only. No deep imports.
- Every module has a colocated \*.test.ts.
- Files stay under 300 lines. Split rather than grow.
- No metaprogramming, no decorators, no dynamic imports, no clever abstractions.
- Named exports only. One barrel per package.

## Architecture

Read ARCHITECTURE.md before changing anything structural. Ports live in
packages/schema/src/ports.ts and are frozen. Every implementation must pass the
contract suites in packages/schema/src/ports.contract.ts.

Database: DATA-MODEL.md. One writer per table; apps/web writes nothing.
Visual: UI-SPEC.md. One accent color, no shadows, no gradients, keyboard first.
Fixtures and integration environment: DEMO.md. Committed cassettes are immutable test evidence.
The public SDK never imports a service or executes a tool call.

## Outcome-verified behaviors

(auto-appended by the ledger, do not hand-edit below this line)
