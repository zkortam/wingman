# Integration guide

Wingman has two integration planes. Keep them separate:

1. The control plane runs synchronously inside the agent host immediately before a
   proposed tool call. It can nudge or stop the host, but it never executes the tool.
2. The evidence plane receives a locally redacted completed session, processes it
   asynchronously, and verifies proposed configuration changes against a model-only
   replay endpoint in the customer's environment.

Observability traces are useful evidence and correlation. They are not a reliable
pre-execution control boundary.

## How an agent connects

The agent itself does not receive database or pipeline credentials. Its host installs
`@zkortam/wingman-sdk` (`npm install @zkortam/wingman-sdk`) and owns four explicit
boundaries:

| Host boundary                     | SDK operation                  | Wingman endpoint                  | Failure behavior                                                                                            |
| --------------------------------- | ------------------------------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Before tool execution             | `reviewToolCall`               | `POST /v1/reviews/tool-calls`     | Configurable open/closed fallback. Send `x-wingman-fail-mode: closed` when `review.failMode` is `"closed"`. |
| After a completed session         | `observeSession`, then `flush` | `POST /v1/events`                 | Queued and contained                                                                                        |
| Before constructing an agent turn | `config`                       | `GET /v1/config/:agent/:userHash` | Signed local/base fallback                                                                                  |
| Model-only verification replay    | `createAgentReplayHandler`     | Customer-hosted HTTPS route       | Pipeline parks; no tool execution                                                                           |

`/v1/events` publishes `session.observed`. Inngest invokes `/api/inngest`, which runs
detection, clustering, classification, fail-before verification, bounded repair,
pass-after verification, apply, and confirmation. Agents never call these internal
stages directly.

## MCP

MCP standardizes discovery and invocation of model-controlled tools. Wingman belongs
in the MCP client/host immediately before the host forwards `tools/call` to a server:

```ts
const decision = await wingman.reviewMcpToolCall({
  sessionId,
  userId,
  userMessage,
  recentTurns,
  context,
  request: mcpToolsCallRequest,
})

if (decision.action === 'ALLOW') {
  return mcpClient.request(mcpToolsCallRequest)
}
if (decision.action === 'RETHINK') {
  return askAgentToReconsider(decision.instruction)
}
return requestHumanApproval(decision.reason)
```

Do not expose Wingman as a tool the model may choose to call. That placement can be
skipped by the model and cannot prove interception. Preserve the MCP tool name exactly
as resolved by the host, including any server prefix used to avoid collisions.

## A2A and other agent transports

A2A standardizes capability discovery and task exchange between opaque agents. It
does not expose the internal tool-execution boundary. For an A2A agent:

- correlate the A2A task with the observed Wingman session;
- review tool calls inside the receiving agent's own host;
- record the completed A2A task as session evidence;
- expose replay from the same host that can reproduce the model decision safely.

The same rule applies to AG-UI and proprietary agent gateways: integrate at their
tool middleware/hook, not at the outer message transport.

## OpenTelemetry and OpenInference

Wingman preserves correlation without taking ownership of the application's trace
exporter:

```ts
wingman.observeSession({
  id: sessionId,
  userId,
  startedAt,
  turns,
  telemetry: {
    convention: 'opentelemetry-genai',
    traceId: activeSpan.spanContext().traceId,
    spanId: activeSpan.spanContext().spanId,
  },
})
```

For OpenInference, use `convention: "openinference"`. For a vendor trace whose ID is
not an OpenTelemetry 32-character trace ID, set `externalTraceId`. Wingman stores only
the identifiers; it does not copy prompt/output span attributes. This avoids duplicate
telemetry, unexpected PII transfer, and coupling to evolving semantic conventions.

Keep the existing OpenTelemetry SDK and Collector. Export traces to the observability
destinations you already use, and send only Wingman's explicit, allowlisted session
envelope to Wingman. Use one trace ID across the root agent operation, model calls,
retrieval, tool proposals, tool execution, and the Wingman review span.

## Langfuse

Langfuse's supported custom-ingestion path is OTLP/HTTP. Continue exporting the
application's OpenTelemetry/OpenInference spans to Langfuse. Call Wingman separately
at the host tool boundary and attach the Langfuse/OpenTelemetry trace ID to the
Wingman session.

Wingman intentionally does not scrape Langfuse or install a second global tracer.
The former delays control until after execution; the latter risks double spans and
processor-order bugs. A Collector fan-out or multiple explicitly configured span
processors is the appropriate observability topology.

## PostHog

PostHog AI Observability groups `$ai_generation`, `$ai_span`, and `$ai_trace` events by
its trace identifiers. Existing `@posthog/ai` instrumentation can remain in place.
Pass the PostHog trace identifier as `externalTraceId`, and invoke Wingman from the
same tool middleware before execution.

Wingman does not mirror PostHog's heavy input/output fields. Session turns go through
Wingman's local allowlist, HMAC user hashing, and PII scrubber first. Product analytics
events and Wingman evidence therefore remain independently consented and retained.

## Framework adapters

`createToolMiddleware(wingman)` is the dependency-free helper for those translations.
It maps LangChain tool input, Vercel AI SDK tool args, and OpenAI Agents tool
arguments onto `reviewToolCall` without installing those frameworks.

Framework-specific adapters should be thin translations into the public contracts:

| Framework capability                      | Wingman translation                         |
| ----------------------------------------- | ------------------------------------------- |
| Tool middleware / before-tool hook        | `reviewToolCall`                            |
| MCP client `tools/call` hook              | `reviewMcpToolCall`                         |
| Conversation/task completion callback     | `observeSession`                            |
| Request-scoped config/provider middleware | `config`                                    |
| Model invocation without tool executor    | `createAgentReplayHandler`                  |
| Trace/span callback                       | Set `telemetry`; keep the existing exporter |

An adapter must not monkey-patch a model SDK, install a global tracer, execute a tool,
or send unredacted vendor traces. If a framework lacks a before-tool hook, Wingman can
observe it but cannot honestly claim to guard it.

Copy-paste shapes. The host still owns the `switch` and the executor:

```ts
const middleware = createToolMiddleware(wingman)

// LangChain tool middleware / wrapTool
const langchain = await middleware.beforeLangChainTool({
  sessionId,
  userId,
  userMessage,
  recentTurns,
  context,
  toolName,
  toolInput,
})

// Vercel AI SDK onToolCall / wrapTool
const vercel = await middleware.beforeVercelTool({
  sessionId,
  userId,
  userMessage,
  recentTurns,
  context,
  toolName,
  args: toolCall.args,
})

// OpenAI Agents SDK
const openai = await middleware.beforeOpenAIAgentTool({
  sessionId,
  userId,
  userMessage,
  recentTurns,
  context,
  toolName: item.name,
  arguments: item.arguments,
})

if (langchain.action !== 'ALLOW') {
  // Do not call the tool. RETHINK feeds instruction back; ESCALATE asks a human.
}
```

`recentTurns` uses the wire `Turn` shape (`textRedacted`, `toolCalls`, `createdAt`).
`observeSession` takes the host's raw `text` and scrubs it locally. See
`demo/amazoff/src/tool-boundary.ts` for a complete intercept-then-execute helper.

## Deployment checklist

- Use HTTPS for Wingman and replay endpoints. Loopback HTTP (`localhost`,
  `127.0.0.1`, `::1`) is allowed only for local use.
- Point the agent host at `WINGMAN_URL`. The control plane's own origin is
  `WINGMAN_API_URL`. On one machine they are the same URL.
- Give SDK, operator, Inngest, replay, Postgres, OpenAI, and Codex boundaries distinct
  credentials. Never expose service-role or replay credentials to a browser.
- Preserve a stable UUID for org, agent, session, config version, incident, and
  candidate identities. Keep user IDs inside the host; Wingman transports only HMACs.
- Configure Inngest signing and event keys and deploy `/api/inngest`.
- Keep replay model-only. The callback returns proposals; it receives no executor.
- Treat prompts, tool arguments/results, trace attributes, and sentiment as sensitive.
- Run `pnpm check` before release and test one ALLOW, RETHINK, ESCALATE, offline,
  malformed-response, redaction, replay, apply, confirmation, and revert scenario in
  the target framework.

Primary specifications: [OpenTelemetry GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/),
[OpenInference](https://arize-ai.github.io/openinference/spec/),
[MCP tools](https://modelcontextprotocol.io/specification/draft/server/tools), and
[A2A](https://a2a-protocol.org/latest/specification/).
