# Changelog

All notable changes to `@zkortam/wingman-sdk` and `@zkortam/wingman-schema`
are recorded here. In this repository the workspace names remain `@wingman/sdk`
and `@wingman/schema`.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the public packages follow [Semantic Versioning](https://semver.org/).

## Unreleased

## 0.1.1 — 2026-08-24

### Fixed

- npm packages export `dist` instead of missing `src`, so
  `import { Wingman } from "@zkortam/wingman-sdk"` resolves.
- HTTP is allowed on IPv6 loopback (`::1`) for local agent development.
- Invalid MCP `tools/call` arguments fail the envelope instead of fail-opening.

### Added

- Undeclared tools escalate with `source: POLICY` before any network call.
- `hashUserId` is re-exported from the SDK.
- `orgId` and `defaultAgent` must be UUIDs.

## 0.1.0 — 2026-08-24

First public release, published as `@zkortam/wingman-schema` and
`@zkortam/wingman-sdk` because the `@wingman` npm organization is already taken.

### Added

- Fail-closed review honors remote `FAIL_OPEN` decisions instead of executing.
- Replay handler rejects callbacks that report nonzero tool executions.
- `createToolMiddleware` for LangChain, Vercel AI SDK, and OpenAI Agents hosts.
- Pipeline resume from `CLASSIFIED` / `ASSERTED`, scheduled confirmation, and a
  persisted production ledger.
- Operator org-scoping, gate precision, and confirmation route.

### Fixed

- Config `timeoutMs` now aborts the underlying fetch.
- Apply uses one confirmation window timestamp and is idempotent after a partial write.
