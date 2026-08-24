# Changelog

All notable changes to `@zkortam/wingman-sdk` and `@zkortam/wingman-schema`
are recorded here. In this repository the workspace names remain `@wingman/sdk`
and `@wingman/schema`.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the public packages follow [Semantic Versioning](https://semver.org/).

## Unreleased

### Changed

- **Wingman talks to Postgres directly instead of through Supabase.** The
  Supabase client used none of the platform - no auth, no storage, no realtime,
  no edge functions - only `.from()` and one `.rpc()`, so it bought an HTTP hop
  and a hosting dependency and nothing else. Postgres itself is unchanged and
  still required: the schema uses jsonb, arrays with GIN containment, partial
  unique indexes, an atomic `on conflict` upsert function, and pgvector. Hosting
  on Supabase still works; it is now just one Postgres among others.
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY` are
    replaced by a single `DATABASE_URL`.
  - `supabase/migrations` moved to `db/migrations`, applied by `pnpm db:migrate`,
    which records what it has run and is safe to repeat.
  - `SupabaseConfigStore` is now `PostgresConfigStore`, `SupabaseLedger` is
    `PostgresLedger`, and `createSupabaseIngestStore` is
    `createPostgresIngestStore`.
  - Serverless deployments should run `max: 1` behind a pooler (pgBouncer, RDS
    Proxy, Neon); connection pooling is the one thing Supabase was providing.

### Fixed

- **Multi-row writes are atomic.** PostgREST has no cross-request transaction, so
  they could not be. Applying a user override, retaining events, and writing a
  session with its turns now each run in one transaction.
- **Identifier filters are no longer split to fit a URL.** PostgREST put
  `in.(...)` in the request line, so a real organisation's id list failed the
  query outright; `= any($1)` sends one parameter. Baselines, silent-failure
  rate, gate precision and outcome listing are now single aggregate queries
  rather than a query per row.
- **The expiry sweep no longer expires states the machine forbids.** It used a
  negative list that still caught `PARKED` and `HUMAN_REVIEW`, taking incidents
  waiting on a human out of the queue and reporting them as lapsed. The set is
  now derived from the state machine.

### Added

- `docker-compose.yml` runs Postgres 17 with pgvector for local development.
- The `PipelineRepository` contract suite runs against real Postgres whenever
  `DATABASE_URL` is set, and says it was skipped when it is not. CI runs it on
  every push against a `pgvector/pgvector:pg17` service, and applies the
  migrations twice to prove they are repeatable.

### Security

- **The default PII scrubber no longer leaks the data it claims to remove.**
  `LocalPiiScrubber` delegated to `openredaction` with its default configuration,
  which left emails, US social security numbers, IP addresses and phone numbers
  untouched while replacing ordinary prose with `[NAME_...]` placeholders,
  corrupting the very text the reviewer reasons over. It is now a first-party,
  deterministic, checksum-validated detector covering email, phone, SSN, credit
  card (Luhn), IBAN, IPv4/IPv6, MAC, JWT, AWS keys, provider secrets,
  private-key blocks and URL credentials, with bounded input size and
  linear-time patterns.
- **The ingest privacy gate inspects content, not only field names.**
  `verifyRedaction` skipped every string, so raw personal data in `textRedacted`
  passed the gate and was persisted under a proof asserting it had been
  scrubbed. The key blocklist was an eight-entry exact match that missed
  `emailAddress`, `user_email`, `apiKey`, and `authorization`. Telemetry
  correlation identifiers are checked too.
- **Operator routes reject cross-site state changes.** Operator endpoints
  authenticate with HTTP Basic, which browsers attach automatically, and
  `Request.json()` parses any body regardless of content type, so a form posting
  `text/plain` could apply or revert configuration on an operator's behalf.
  Mutating requests now require a same-origin signal, and JSON bodies must be
  declared as `application/json`.
- **Deeply nested JSON is rejected instead of crashing the handler.**
  `JsonValueSchema` validated by recursion, so `safeParse` threw a `RangeError`
  rather than returning a failure; every route reads `parsed.success` to decide
  on a 400, so the throw escaped validation entirely. Validation is iterative
  and bounded by depth, node count, and string length, detects cycles, and
  rejects `__proto__` keys.
- `canonicalJSON` is depth-bounded and cycle-checked, and refuses non-finite
  numbers instead of signing them as `null`, which gave two materially different
  configurations the same signature.
- `evaluateAssertion` reads own properties only. An assertion on the argument
  `__proto__` resolved to `Object.prototype` and passed against any tool call,
  making a VERIFY_PASS forgeable.
- The SDK's writable-path allowlist is copied and frozen at construction, so a
  later push into the caller's array cannot widen the config-trust boundary.
- Signed configuration read back from local storage must not be older than a
  version already served, so a stale envelope cannot reinstate a revoked policy.
  A deliberate operator rollback from the live control plane still applies.
- The local configuration cache defaults to a per-user state directory instead
  of a predictable path in the shared temp directory, verifies ownership, and
  expires and evicts entries.
- Publishing to npm runs the full product gate first and refuses to publish
  unless the git tag matches the package versions.

### Fixed

- **`createToolMiddleware` no longer erases tool arguments.** Any `undefined`
  value anywhere in a tool input replaced the entire argument object with `{}`,
  so the reviewer approved a no-argument call while the host executed the real
  one. `undefined` is now an absent key; inputs that genuinely cannot be
  represented (a `Map`, a class instance, a cycle) escalate instead of being
  silently emptied.
- **`diffConfigs` and `applyDiff` are inverses again.** Adding a tool failed with
  a misleading staleness error and removing one threw an unhandled `ZodError`, so
  the repair lane could never add or remove a tool or clear tool parameters.
- **The control plane's signatures verify.** `orgs.signing_key` is a `bytea`
  column that PostgREST renders hex-escaped; it was used as an HMAC key without
  decoding, so every signature the server issued failed verification in the SDK,
  which then silently fell back to its compiled base configuration.
- **Applying a change records the outcome before the configuration goes live.** A
  failure between the two left a mutated configuration on real users with no
  outcome row for revert to act on. A retried apply completes the work instead of
  reporting success over a half-applied state.
- **Run idempotency is scoped to the incident.** Assertions are deduplicated per
  agent, so two incidents sharing one assertion collided on the VERIFY_FAIL
  uniqueness key and the second parked permanently
  (`0005_run_uniqueness_by_incident.sql`).
- **Session fingerprints are scoped to their agent.** User hashes are
  organisation-scoped, so a session on one agent could match, confirm, and
  ultimately revert a configuration applied to another.
- Timestamps carrying a UTC offset are accepted. `z.string().datetime()` rejected
  every value produced by Postgres `timestamptz`, Go's `time.RFC3339`, and
  Python's `datetime.isoformat()` outside UTC.
- Review no longer degrades to a silent ALLOW when a host passes more than 20
  recent turns, an over-long user message, or an unrecognised `context` key.
  Oversized input is trimmed and reported; an empty user message is valid, since
  an agent-initiated tool call has none.
- Modifier chords no longer trigger the operator console's single-letter
  shortcuts. `Cmd+A` applied a configuration change to a live user.
- The replay repository's `updateIncident` rejects rather than throwing
  synchronously, matching the Supabase store.

### Performance

- The operator inbox reads incidents with one bounded query. It loaded a
  six-query snapshot per incident, unbounded in the incident count, and that same
  call was the per-request authorization check, so every operator command paid
  for it.
- Authorizing one incident is a single counting query.
- `gatePrecision`, `silentFailureRate`, `listOutcomes`, `findPendingOutcome`, and
  baseline detection no longer issue one query per row, and every identifier
  filter is split into request-sized batches. An unbatched `in.(...)` list
  exceeded the PostgREST request-line limit and failed outright at real scale.

### Added

- `onDiagnostic` reports every contained SDK failure with a stable code, so a
  wrong API key is distinguishable from a quiet week.
- `configSource()` and `invalidateConfig()` on the client; `observation` options
  for queue capacity, timeout, concurrency, retry budget, and auto-flush;
  delivery retries with backoff.
- `detectPii` and `VERIFIABLE_PII_CATEGORIES` in the schema package, shared by
  the host scrubber and the server-side gate.
- `PipelineReader.incidentInOrg` and a `limit` option on `listIncidents`.
- A shared `PipelineRepository` contract suite run against both the Supabase
  store and the in-memory replay repository, and an in-memory
  PostgREST-compatible client so the production store is testable.
- A coverage gate (`pnpm coverage`) with thresholds, and `pnpm format`.

### Changed

- **The SDK has no third-party runtime dependencies.** `openredaction` pulled in
  `express`, `react`, and peer dependencies on `mammoth`, `pdf-parse`, and
  `tesseract.js` for a guardrail package. Hosts that want it can still supply it
  through the `scrubber` option, which is unchanged.
- CI runs the product gate on Linux, Windows, and macOS, and on Node 22 and 24.
  Two release scripts were broken on Windows and the single-OS matrix never saw
  it.
- Repository formatting is enforced by Prettier.

## 0.1.2 — 2026-08-24

### Fixed

- Published SDK JavaScript imports `@zkortam/wingman-schema` instead of the
  workspace name `@wingman/schema`, so a clean `npm install` can resolve.

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
