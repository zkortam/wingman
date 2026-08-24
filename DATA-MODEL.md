# Data Model

**Owner: Engineer A.** Append-only after the T+0:25 freeze — a new migration file, never an edit to `0001_init.sql`.

This file is the full DDL, the write-ownership map, the state machine, and the four derivations (user hash, task fingerprint, incident key, config signature) that both engineers must implement identically. `MASTERPLANHACKATHON.md` §8 is the sketch; this is the buildable version. Every addition to that sketch is marked **`+`** with its reason.

---

## 1. Three zones, three retention policies

| Zone | Tables | Retention | Availability requirement |
|---|---|---|---|
| **Config** | `orgs`, `agents`, `config_versions`, `config_overrides` | forever | **highest.** The read path. Must survive everything else being down. |
| **Events** | `sessions`, `turns`, `signals` | **30 days**, hard-deleted | normal |
| **Ledger** | `incidents`, `assertions`, `runs`, `candidates`, `outcomes` | **forever** | normal |

The ledger outlives the events it was derived from. An incident from March still reads as a complete proof in September even though its sessions were deleted in April — which is why `incidents.session_ids` is an array of ids and the evidence excerpts are copied onto the incident, not joined at read time.

---

## 2. Write ownership

**One writer per table.** This is what makes it impossible for A and B to collide.

| Tables | Sole writer | Readers |
|---|---|---|
| `orgs`, `agents`, `config_versions`, `config_overrides` | `services/config` (**B**) | pipeline, web, sdk |
| `sessions`, `turns`, `signals` | `services/ingest` (**A**) | pipeline, web |
| `incidents`, `assertions`, `runs`, `candidates`, `outcomes` | `services/pipeline` (**A**) | web |

`apps/web` writes nothing, ever. If a route handler wants a Supabase client, a port is missing — see `ARCHITECTURE.md` §3.

---

## 3. Conventions

- **No native Postgres enums.** `text` + `CHECK`. Altering a pg enum inside a transaction is painful and we will change these lists during the build. zod in `@wingman/schema` is the source of truth; the CHECK is the backstop.
- **`timestamptz` always.** Never bare `timestamp`.
- **UUID v4 via `gen_random_uuid()`**, except `sessions.id`, which the client supplies so ingest is idempotent on replay.
- **`jsonb`, never `json`.**
- **Every table that a pipeline stage writes has a natural uniqueness constraint** so the stage is idempotent under Inngest redelivery. These are listed as `-- idempotency` below and they are not optional.

---

## 4. DDL — `supabase/migrations/0001_init.sql`

```sql
create extension if not exists pgcrypto;
create extension if not exists vector;

-- ═══════════════════════════════════════════════════════════════════
-- CONFIG ZONE — written only by services/config
-- ═══════════════════════════════════════════════════════════════════

create table orgs (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  user_salt     bytea not null default gen_random_bytes(32),  -- + HMAC salt for user_hash
  signing_key   bytea not null default gen_random_bytes(32),  -- + HMAC key for config signatures
  created_at    timestamptz not null default now()
);

create table agents (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references orgs(id) on delete cascade,
  name              text not null,
  base_config       jsonb not null,
  base_version      int  not null default 1,
  active_version_id uuid,                                     -- + the GLOBAL pointer. see §5.
  writable_paths    text[] not null default '{}',             -- + the field allowlist, §9
  max_diff_bytes    int  not null default 4096,               -- + the hard diff cap
  codex_endpoint    text,                                     -- + CODE_DEFECT handoff target
  created_at        timestamptz not null default now(),
  unique (org_id, name)
);

create table config_versions (
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid not null references agents(id) on delete cascade,
  version      int  not null,
  config       jsonb not null,
  incident_id  uuid,                                          -- null for BASE versions
  signature    text not null,                                 -- hmac-sha256, §8
  created_by   text not null check (created_by in ('BASE','PIPELINE','HUMAN')),
  created_at   timestamptz not null default now(),
  unique (agent_id, version)                                  -- idempotency
);

alter table agents
  add constraint agents_active_version_fk
  foreign key (active_version_id) references config_versions(id);

create table config_overrides (
  id               uuid primary key default gen_random_uuid(),
  agent_id         uuid not null references agents(id) on delete cascade,
  user_hash        text not null,
  version_id       uuid not null references config_versions(id),
  scope            text not null check (scope in ('USER','GLOBAL')),
  incident_id      uuid,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz,
  revoked_at       timestamptz,                               -- + revert = set this. never DELETE.
  last_resolved_at timestamptz                                -- + staleness: unexercised 90d → flag
);

-- + at most one live override per (agent, user). makes resolution a single indexed lookup
--   and makes "revert is a pointer swap" literally true.
create unique index config_overrides_live
  on config_overrides (agent_id, user_hash)
  where revoked_at is null;

-- ═══════════════════════════════════════════════════════════════════
-- EVENT ZONE — written only by services/ingest · 30 day retention
-- ═══════════════════════════════════════════════════════════════════

create table sessions (
  id                uuid primary key,                         -- client-supplied → idempotent ingest
  org_id            uuid not null references orgs(id) on delete cascade,
  agent_id          uuid not null references agents(id) on delete cascade,
  user_hash         text not null,
  persona_id        text,                                     -- + fixtures only, null in production
  config_version_id uuid references config_versions(id),      -- what they actually ran against
  task_fingerprint  text,                                     -- + §7
  started_at        timestamptz not null,
  ended_at          timestamptz,
  ingested_at       timestamptz not null default now()
);

create table turns (
  session_id    uuid not null references sessions(id) on delete cascade,
  idx           int  not null,
  role          text not null check (role in ('user','assistant','tool')),
  text_redacted text,
  tool_calls    jsonb not null default '[]',
  embedding     vector(1536),
  created_at    timestamptz not null,
  primary key (session_id, idx)                               -- idempotency
);

create table signals (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  turn_idx    int  not null,
  kind        text not null check (kind in ('RETRY_REQUEST','RESTATED_CONSTRAINT','ABANDON_RESTART')),
  confidence  real not null check (confidence between 0 and 1),
  baseline    real,                                           -- + this user's own rate for this kind
  evidence    jsonb not null default '{}',
  detected_at timestamptz not null default now(),
  unique (session_id, turn_idx, kind)                         -- idempotency
);

-- ═══════════════════════════════════════════════════════════════════
-- LEDGER ZONE — written only by services/pipeline · forever
-- ═══════════════════════════════════════════════════════════════════

create table incidents (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references orgs(id) on delete cascade,
  agent_id           uuid not null references agents(id) on delete cascade,
  key                text not null,                           -- + §7. the idempotency key for the whole pipeline.
  fingerprint        text not null,
  signal_kind        text not null,
  title              text not null,
  state              text not null default 'OPEN'
                     check (state in ('OPEN','CLUSTERED','CLASSIFIED','ASSERTED','CANDIDATE',
                                      'APPLIED','CONFIRMED','DISCARDED','PARKED','REVERTED',
                                      'HUMAN_REVIEW','EXPIRED')),
  state_reason       text,                                    -- + why it parked. shown in the UI.
  verdict            text check (verdict in ('VARIANCE','PREFERENCE','CONFIG_DEFECT','CODE_DEFECT')),
  verdict_confidence real,
  verdict_evidence   jsonb,                                   -- + the ranked evidence the gate used
  assertion_id       uuid,                                    -- the true identity, once asserted
  user_hashes        text[] not null default '{}',
  session_ids        uuid[] not null default '{}',
  evidence_excerpts  jsonb not null default '[]',             -- + copied, not joined. outlives the events.
  first_seen         timestamptz not null default now(),
  last_seen          timestamptz not null default now(),
  expires_at         timestamptz,                             -- + 14d without recurrence → EXPIRED
  unique (agent_id, key)                                      -- idempotency
);

create table assertions (
  id                uuid primary key default gen_random_uuid(),
  incident_id       uuid references incidents(id) on delete cascade,  -- null for mined positives
  agent_id          uuid not null references agents(id) on delete cascade,
  kind              text not null check (kind in ('TOOL_CALLED','TOOL_ARG_EQUALS','OUTPUT_MATCHES_RULE')),
  params            jsonb not null,                           -- shape per kind, ARCHITECTURE.md §7
  identity          text not null,                            -- + canonical hash of (kind, params). §7
  source_session_id uuid,
  polarity          text not null check (polarity in ('positive','negative')),
  created_at        timestamptz not null default now(),
  unique (agent_id, identity)                                 -- idempotency + dedup of the positive suite
);

alter table incidents
  add constraint incidents_assertion_fk
  foreign key (assertion_id) references assertions(id);

create table candidates (
  id              uuid primary key default gen_random_uuid(),
  incident_id     uuid not null references incidents(id) on delete cascade,
  diff            jsonb not null,
  diff_bytes      int  not null,                              -- + checked against agents.max_diff_bytes
  base_version_id uuid not null references config_versions(id),
  new_version_id  uuid references config_versions(id),        -- set only once VERIFIED and applied
  iteration       int  not null default 1 check (iteration <= 3),   -- + the ≤3 cap, enforced
  state           text not null default 'PROPOSED'
                  check (state in ('PROPOSED','VERIFIED','REJECTED','APPLIED')),
  rejected_reason text,
  created_at      timestamptz not null default now(),
  unique (incident_id, iteration)                             -- idempotency
);

create table runs (
  id                uuid primary key default gen_random_uuid(),
  assertion_id      uuid not null references assertions(id) on delete cascade,
  incident_id       uuid references incidents(id) on delete cascade,
  phase             text not null check (phase in ('VERIFY_FAIL','VERIFY_PASS','POSITIVE_SUITE')),
  config_version_id uuid references config_versions(id),
  candidate_id      uuid references candidates(id),
  n                 int  not null,
  pass_count        int  not null,
  results           jsonb not null,                           -- per-run: {passed, toolCalls, cassetteKey}
  -- 🔴 THE INVARIANT, ENFORCED BY THE DATABASE.
  -- The runner reports how many tool calls it executed. Postgres refuses to store a run
  -- that executed any. A regression here fails at write time, not at review time.
  tool_executions   int  not null default 0 check (tool_executions = 0),
  created_at        timestamptz not null default now()
  -- idempotency: candidate_id is NULL for VERIFY_FAIL, and NULLs are DISTINCT in a
  -- UNIQUE constraint — so a plain unique(...) would silently never dedup those rows.
  -- Two partial indexes instead. See the note under Indexes.
);

create unique index runs_verify_fail on runs (assertion_id, phase) where candidate_id is null;
create unique index runs_by_candidate on runs (assertion_id, phase, candidate_id) where candidate_id is not null;

create table outcomes (
  id                 uuid primary key default gen_random_uuid(),
  incident_id        uuid not null references incidents(id) on delete cascade,
  candidate_id       uuid not null references candidates(id),
  scope              text not null check (scope in ('USER','GLOBAL')),
  applied_to         text[] not null,                         -- user_hashes
  applied_version_id uuid not null references config_versions(id),
  status             text not null default 'PENDING'
                     check (status in ('PENDING','CONFIRMED','REFUTED','UNOBSERVED','REVERTED')),
  window_ends_at     timestamptz not null,                    -- + confirmation window, §6
  confirmed_at       timestamptz,
  reverted_at        timestamptz,
  created_at         timestamptz not null default now(),
  unique (incident_id, candidate_id, scope)                   -- idempotency
);
```

### Indexes — one per query we actually run

```sql
-- read path. the only query with a latency budget (<50ms cold, <1ms cached).
-- covered by config_overrides_live above, plus:
create index config_versions_agent on config_versions (agent_id, version desc);

-- inbox: incidents for an org, sorted by users affected
create index incidents_inbox on incidents (org_id, state, last_seen desc);
-- clustering: does this key already exist? (covered by the unique constraint)
-- confirmation sweep: which outcomes are pending and past their window?
create index outcomes_pending on outcomes (status, window_ends_at) where status = 'PENDING';
-- expiry sweep
create index incidents_expiring on incidents (expires_at) where state not in ('CONFIRMED','DISCARDED','EXPIRED');
-- detection: recent sessions for a user, for baselining
create index sessions_user on sessions (agent_id, user_hash, started_at desc);
-- the positive suite: every positive assertion for an agent
create index assertions_positive on assertions (agent_id) where polarity = 'positive';
-- retention sweep
create index sessions_retention on sessions (ingested_at);

-- pgvector: only if embeddings survive the cut list. ivfflat needs data before it helps.
create index turns_embedding on turns using ivfflat (embedding vector_cosine_ops) with (lists = 100);
```

### Row-level security

```sql
do $$ declare t text;
begin
  foreach t in array array['orgs','agents','config_versions','config_overrides',
                           'sessions','turns','signals',
                           'incidents','assertions','runs','candidates','outcomes']
  loop execute format('alter table %I enable row level security', t); end loop;
end $$;
-- No permissive policies in the MVP. Every server path uses the service role;
-- the browser never talks to Postgres directly, it goes through PipelineReader.
-- RLS is on so that the day someone adds an anon client, it denies by default rather than leaking.
```

That is the honest position and it is worth stating out loud to a judge: RLS is enabled and deny-all, access is server-side only, and multi-tenant policies are a post-hackathon task on the explicit do-not-build list.

---

## 5. Config resolution — why `active_version_id` exists

`MASTERPLANHACKATHON.md` §8 puts `scope` on `config_overrides`, which implies a GLOBAL apply writes one override row per user. That does not scale and it makes revert an N-row operation. One refinement:

```
GLOBAL apply  →  update agents.active_version_id           (one row, one pointer)
USER apply    →  insert config_overrides (agent, user_hash) (one row, one pointer)
revert        →  set revoked_at, or point active_version_id back  (one row, reversible)
```

`config_overrides.scope` is retained because the **ledger** needs to record what kind of decision was made, and `outcomes.scope` reads from it.

**Resolution order — `ConfigStore.resolve(agentId, userHash)`:**

```
1. live override for (agent, user)        → config_versions.config
2. agents.active_version_id               → config_versions.config
3. agents.base_config                     → the compiled-in baseline
```

Three DB-visible levels. The SDK wraps this in its own four-level chain (`ARCHITECTURE.md` §8) that ends in a constant inside the customer's bundle, so `config()` cannot fail even if all three of these are unreachable.

**Every apply writes a new immutable signed version. Nothing is ever mutated in place.** Revert is a pointer swap, which is what makes `USER`-scope auto-apply safe: blast radius one person, undo cost one UPDATE.

---

## 6. The incident state machine

```
OPEN → CLUSTERED → CLASSIFIED → ASSERTED → CANDIDATE → APPLIED → CONFIRMED
                        │            │          │           │
                        ▼            ▼          ▼           ▼
                    DISCARDED    DISCARDED   PARKED     REVERTED   (REFUTED only)

any state ──► HUMAN_REVIEW   (ambiguous · policy conflict · not isolatable)
any state ──► EXPIRED        (no recurrence in 14 days)
```

**`PARKED` and `HUMAN_REVIEW` are normal outcomes, not errors. Nothing loops.**

Allowed transitions, enforced in `services/pipeline/src/state.ts` and unit-tested as a table:

| From | To | Trigger |
|---|---|---|
| `OPEN` | `CLUSTERED` | second session joins the key, or immediately at K=1 |
| `CLUSTERED` | `CLASSIFIED` | gate returned a verdict |
| `CLUSTERED` | `HUMAN_REVIEW` | gate refused |
| `CLASSIFIED` | `DISCARDED` | verdict `VARIANCE` |
| `CLASSIFIED` | `ASSERTED` | assertion generated and schema-valid |
| `CLASSIFIED` | `PARKED` | assertion generation returned junk 3× |
| `ASSERTED` | `DISCARDED` | verify-fail passCount in 2..5 — flaky, or our read was wrong |
| `ASSERTED` | `CANDIDATE` | verify-fail passCount ≤ 1 **and** a candidate was produced |
| `ASSERTED` | `HUMAN_REVIEW` | verdict `CODE_DEFECT` → handoff payload, no auto path |
| `CANDIDATE` | `PARKED` | verify-pass < 4/5, or the positive suite regressed, or iteration 3 exhausted |
| `CANDIDATE` | `APPLIED` | `USER` scope auto, or a human approved `GLOBAL` |
| `APPLIED` | `CONFIRMED` | user repeated the task, signal did not fire |
| `APPLIED` | `REVERTED` | user repeated the task, **signal fired again** |
| `APPLIED` | `CONFIRMED` | window elapsed with no matching task → `UNOBSERVED`, **kept** |

The last row is the one people get wrong. **Revert on evidence of failure, never on absence of evidence.** `UNOBSERVED` keeps the fix and marks the outcome unconfirmed; a user who hits a task once a month would otherwise have a working fix silently rolled back.

Confirmation window: **24 hours** from apply, or the user's next session with a matching `task_fingerprint`, whichever comes first.

---

## 7. The four derivations

Both engineers implement these. They must agree byte for byte, so all four live in `@wingman/schema` as pure functions with tests.

### `userHash(orgSalt, userId)`
```ts
hmacSHA256(orgSalt, userId).hex().slice(0, 32)
```
Per-org salt, not global — a hash cannot be correlated across customers. **We never store an identity.** The salt lives in `orgs.user_salt` and never leaves the server; the SDK computes the hash locally with a salt fetched once at init, so raw user ids never reach us.

### `taskFingerprint(session)`
Deliberately crude. Clustering is recall-oriented; precision comes from the gate and from the assertion.
```ts
sha256([ agentId, firstToolDecision?.name ?? 'no_tool', objectTypeOf(firstToolDecision) ].join('|'))
```
Falls back to the cosine centroid of the session's user-turn embeddings when there is no tool decision. If embeddings get cut, sessions with no tool decision simply do not cluster — an acceptable loss, documented rather than hidden.

### `incidentKey(agentId, signalKind, taskFingerprint)`
```ts
sha256([agentId, signalKind, taskFingerprint].join('|'))
```
**The idempotency key for the entire pipeline.** Every stage upserts on it. Inngest redelivery is therefore free.

### `assertionIdentity(kind, params)`
```ts
sha256(canonicalJSON({ kind, ...params }))
```
**The assertion is the true cluster key.** Fingerprint is a bucketing heuristic; identity is identity. If a new session's assertion identity does not match the incident's, it spawns its own incident — enforced by `unique (agent_id, identity)` on `assertions`.

---

## 8. Canonical JSON and config signatures

Signatures are verified by the SDK, in the customer's process. Producer and verifier must serialise identically or every version is rejected and every agent silently falls back to base — a failure that looks like "the product does nothing."

```ts
// @wingman/schema — one implementation, used by both sides
export function canonicalJSON(v: unknown): string
// object keys sorted lexicographically · no whitespace · arrays keep order
// numbers via JSON.stringify · undefined dropped · no Date/Map/Set (throws)

export function signConfig(key: Buffer, agentId: string, version: number, cfg: AgentConfig): string
// = hmacSHA256(key, `${agentId}.${version}.${canonicalJSON(cfg)}`).hex()
```

The SDK rejects an unsigned or mismatched version and falls back to base. `orgs.signing_key` is the shared secret; it is delivered to the SDK once at init over TLS and cached in memory only.

**Contract test both sides run:** `canonicalJSON` over a fixture of 20 awkward values (nested empty objects, unicode keys, `-0`, `1e21`, deeply nested arrays) must produce a byte-identical string in both packages. It lives in `packages/schema/src/canonical.test.ts` and is part of `pnpm check`.

---

## 9. The field allowlist

`agents.writable_paths` is the customer's declaration of what we may ever change.

```
['systemPrompt', 'tools.*.description', 'retrieval.*', 'rules']
```

Enforced in **three** places, deliberately redundant:

1. **The SDK, client-side** — `Outcome.init({ writable })`. Rejected before anything leaves their process.
2. **The fix agent** — the diff generator is only shown allowlisted paths, so it cannot propose an illegal one.
3. **`config.mutations.writeVersion`** — validates every diff path against `writable_paths` and against `max_diff_bytes` before writing. Exceeding the byte cap forces human approval regardless of scope.

Rejection at any layer parks the incident. It never retries with a smaller diff — that would be the system negotiating with its own safety rail.

---

## 10. Retention

```ts
// services/pipeline/src/functions/99-retention.ts — daily Inngest cron
delete from turns    where session_id in (select id from sessions where ingested_at < now() - interval '30 days')
delete from signals  where session_id in (…)
delete from sessions where ingested_at < now() - interval '30 days'
```

Ledger tables are never swept. `incidents.evidence_excerpts` is populated at clustering time precisely so the proof survives the sweep — an incident opened in March is still fully readable in September.

Sweep order matters: children first, or the cascade does the work but the delete plan is unbounded.

---

## 11. Seeding and `demo:reset`

```
1. supabase db reset                     drop + re-run migrations
2. insert org, agent, base config        from fixtures/agent/config.base.json
3. apply defect mutation                 OC-001 by default: writes a v2 with the bad tool description
4. load fixtures/agent/seed.sql          50 opportunities, 3 with status=New
5. replay fixtures/sessions/seeded.jsonl through the real POST /v1/events
6. wait for the pipeline to settle       inngest dev, ~10s
7. assert: 1 incident, 12 user_hashes, state=CANDIDATE
```

Step 5 is the point of the whole exercise: **the seeded cohort is real data through the real pipeline**, not fixture rows inserted into `incidents`. The inbox says "12 users affected" because twelve synthetic users actually failed.

Budget: **under 30 seconds, three times consecutively.** If it drifts over, that is a bug with the same priority as a broken test.

---

## 12. What we deliberately did not model

| Not modelled | Why | When it arrives |
|---|---|---|
| Users, teams, memberships | Auth is on the do-not-build list for the MVP | with Supabase Auth, post-hackathon |
| Multi-tenancy policies | RLS is deny-all; access is server-side only | before the first design partner |
| Soft deletes on ledger rows | The ledger is the audit trail. It does not delete. | never |
| `ORG` and `SESSION` scopes | Complexity budget: 2 scopes | when a design partner blocks on it |
| Assertion versioning | An edited assertion is a new assertion, by identity | never |
| A `config_diffs` table | The diff lives on `candidates`; versions store full configs | never — full configs make revert trivial |
