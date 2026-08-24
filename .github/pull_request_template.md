## What changed

<!-- User-visible behavior in one or two sentences. -->

## Why

<!-- The failure this prevents, or the contributor/operator job it unblocks. -->

## How it was verified

- [ ] A colocated test failed for the intended reason, then passed
- [ ] `pnpm check` is green
- [ ] No new deep imports, cycles, or files over 300 lines
- [ ] Public types live in `@wingman/schema` if this is a wire change
- [ ] Deterministic cassettes were not regenerated unless that is the change

## Failure mode

<!-- What happens when the model, database, or network is down? -->
