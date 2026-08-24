# Contributing

Wingman accepts focused issues and pull requests. Before changing architecture, read
`ARCHITECTURE.md`, `DATA-MODEL.md`, and the nearest `AGENTS.md`.

## Development

Use Node.js 22 and pnpm 10:

```bash
pnpm install --frozen-lockfile
pnpm check
```

Every behavior change must include a test that demonstrates the failure before the
implementation and passes afterward. Keep tests colocated, TypeScript files below 300
lines, imports at package roots, and public types in `packages/schema`.

Pull requests should explain the user-visible behavior, failure mode, verification
performed, and any migration or compatibility impact. Never regenerate deterministic
cassettes as part of an unrelated change. Do not commit credentials, raw user data,
unredacted prompts, production traces, or Supabase service-role keys.

## Compatibility

The public packages are pre-1.0. Breaking wire or SDK changes require a migration note
and coordinated version bumps for `@wingman/schema` and `@wingman/sdk`. Frozen ports in
`packages/schema/src/ports.ts` require an explicit architecture decision before change.
