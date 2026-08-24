# Changelog

All notable changes to `@wingman/sdk` and `@wingman/schema` are recorded here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the public packages follow [Semantic Versioning](https://semver.org/).

## Unreleased

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

## 0.1.0

- Initial public SDK and schema contracts. Not yet published to npm; install from
  this repository.
