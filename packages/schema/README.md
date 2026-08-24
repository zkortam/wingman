# @zkortam/wingman-schema

On npm this package is `@zkortam/wingman-schema`. In this monorepo the workspace
name remains `@wingman/schema`.

Runtime-validated, dependency-light contracts shared by `@zkortam/wingman-sdk`
and a Wingman control plane. Agent hosts should install `@zkortam/wingman-sdk`;
this package is public so the wire formats stay inspectable and versioned.

```ts
import {
  AgentConfigSchema,
  ToolCallReviewDecisionSchema,
  ToolCallReviewRequestSchema,
} from '@zkortam/wingman-schema'
```

Port implementations (control-plane services, not agent hosts) can import
`@wingman/schema/contracts` and run the shared contract suite. That path needs
`vitest` as an optional peer.

Licensed under MIT.
