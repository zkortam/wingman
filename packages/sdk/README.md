# @wingman/sdk

Wingman reviews proposed tool calls before execution, resolves signed agent
configuration, and captures locally redacted session evidence. It never executes a
tool call. The host application keeps the tool boundary and remains authoritative.

```ts
import { Wingman } from "@wingman/sdk";

const wingman = Wingman.init({
  endpoint: process.env.WINGMAN_URL!,
  apiKey: process.env.WINGMAN_API_KEY!,
  orgId: process.env.WINGMAN_ORG_ID!,
  orgSalt: process.env.WINGMAN_ORG_SALT!,
  signingKey: process.env.WINGMAN_SIGNING_KEY!,
  defaultAgent: process.env.WINGMAN_AGENT_ID!,
  baseConfig,
  writable: ["rules", "tools.*.description"],
  redact: { fields: ["turns", "lastQuery"] },
});

const review = await wingman.reviewToolCall({
  sessionId,
  userId,
  userMessage,
  proposedCall,
  recentTurns,
  context,
});

if (review.action === "ALLOW") {
  await executeInYourHost(proposedCall);
} else if (review.action === "RETHINK") {
  await askAgentToReconsider(review.instruction);
} else {
  await requestHumanApproval(review.reason);
}
```

Review failures are fail-open by default so an unavailable sidecar does not take down
the host agent. Set `review: { failMode: "closed" }` for high-risk environments.
Queued, sent, failed, and capacity-dropped observations are available through
`wingman.observationStats()`.

Config reads use a short bounded cold-path timeout and then fall back to last-known-good
or compiled base configuration. Cross-region and cold-service deployments can set a
measured budget such as `config: { timeoutMs: 1000 }`; cached reads remain local.

For fail-before/pass-after verification, expose a private model-only replay route:

```ts
import { createAgentReplayHandler } from "@wingman/sdk";

export const POST = createAgentReplayHandler({
  token: process.env.WINGMAN_RUNNER_TOKEN!,
  run: ({ config, messages, context, sample }) =>
    runModelWithoutExecutingTools({ config, messages, context, sample }),
});
```

The callback has no execution hook. It returns proposed tool calls, optional text, and
a stable cassette key. The handler validates the wire format and rejects any result
that reports tool executions.

MCP clients can pass an intercepted JSON-RPC `tools/call` request to
`wingman.reviewMcpToolCall`. Invalid MCP envelopes fail closed or open according to
`review.failMode`. LangChain, Vercel AI SDK, and OpenAI Agents hosts can use
`createToolMiddleware(wingman)` as a dependency-free translation into `reviewToolCall`.
Existing OpenTelemetry, OpenInference, Langfuse, and PostHog tracing can remain
installed; add `telemetry` trace correlation to the observed session instead of
installing a second global tracer or copying raw vendor spans.

A replay callback that reports `toolExecutions !== 0` is rejected. The handler still
stamps a successful response at zero executions because the callback is not given an
executor.

Node.js 22 or newer. Licensed under MIT.
