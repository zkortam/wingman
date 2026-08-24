import { StageError, type HandoffPayload } from "@wingman/schema";
import WebSocket from "ws";
import { z } from "zod";

const JsonRpcResponseSchema = z
  .object({
    id: z.number(),
    result: z.unknown().optional(),
    error: z.object({ code: z.number(), message: z.string() }).optional(),
  })
  .passthrough();

const ThreadStartSchema = z
  .object({ thread: z.object({ id: z.string().min(1) }).passthrough() })
  .passthrough();

export interface AppServerClient {
  handoff(payload: HandoffPayload): Promise<{ threadId: string }>;
  writeAgentsMd(input: { threadId: string; content: string }): Promise<void>;
}

export class ReplayAppServerClient implements AppServerClient {
  readonly handoffs: HandoffPayload[] = [];
  readonly writebacks: Array<{ threadId: string; content: string }> = [];

  handoff(payload: HandoffPayload): Promise<{ threadId: string }> {
    this.handoffs.push(payload);
    return Promise.resolve({
      threadId: `replay-thread-${this.handoffs.length}`,
    });
  }

  writeAgentsMd(input: { threadId: string; content: string }): Promise<void> {
    this.writebacks.push(input);
    return Promise.resolve();
  }
}

export class WebSocketAppServerClient implements AppServerClient {
  constructor(
    private readonly endpoint: string,
    private readonly token: string,
    private readonly timeoutMs = 30_000,
  ) {
    if (!endpoint.startsWith("wss://"))
      throw new Error("Codex App Server endpoint must use wss://");
    if (token.length === 0)
      throw new Error("Codex App Server bearer token is required");
  }

  async handoff(payload: HandoffPayload): Promise<{ threadId: string }> {
    const rpc = await JsonRpcConnection.connect(
      this.endpoint,
      this.token,
      this.timeoutMs,
    );
    try {
      await rpc.request("initialize", {
        clientInfo: {
          name: "outcome-pipeline",
          title: "Outcome Pipeline",
          version: "1.0.0",
        },
        capabilities: { experimentalApi: true },
      });
      rpc.notify("initialized", {});
      const started = ThreadStartSchema.parse(
        await rpc.request("thread/start", {
          approvalPolicy: "never",
          sandbox: "read-only",
        }),
      );
      const completed = rpc.waitFor("turn/completed");
      await rpc.request("turn/start", {
        threadId: started.thread.id,
        input: [{ type: "text", text: JSON.stringify(payload) }],
      });
      await completed;
      return { threadId: started.thread.id };
    } finally {
      rpc.close();
    }
  }

  async writeAgentsMd(input: {
    threadId: string;
    content: string;
  }): Promise<void> {
    const rpc = await JsonRpcConnection.connect(
      this.endpoint,
      this.token,
      this.timeoutMs,
    );
    try {
      await rpc.request("initialize", {
        clientInfo: {
          name: "outcome-pipeline",
          title: "Outcome Pipeline",
          version: "1.0.0",
        },
        capabilities: { experimentalApi: true },
      });
      rpc.notify("initialized", {});
      const completed = rpc.waitFor("turn/completed");
      await rpc.request("turn/start", {
        threadId: input.threadId,
        input: [
          {
            type: "text",
            text: `Append this confirmed outcome to AGENTS.md:\n${input.content}`,
          },
        ],
      });
      await completed;
    } finally {
      rpc.close();
    }
  }
}

class JsonRpcConnection {
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: unknown) => void }
  >();
  private readonly notifications = new Map<
    string,
    Array<(params: unknown) => void>
  >();

  private constructor(
    private readonly socket: WebSocket,
    private readonly timeoutMs: number,
  ) {
    socket.on("message", (data) => this.receive(data.toString()));
    socket.on("error", (error) => this.rejectAll(error));
    socket.on("close", () =>
      this.rejectAll(new Error("Codex App Server connection closed")),
    );
  }

  static connect(
    endpoint: string,
    token: string,
    timeoutMs: number,
  ): Promise<JsonRpcConnection> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const timer = setTimeout(() => {
        socket.close();
        reject(new StageError("handoff", "LLM_UNAVAILABLE", true));
      }, timeoutMs);
      socket.once("open", () => {
        clearTimeout(timer);
        resolve(new JsonRpcConnection(socket, timeoutMs));
      });
      socket.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;
    this.socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    return new Promise((resolve, reject) =>
      this.pending.set(id, { resolve, reject }),
    );
  }

  notify(method: string, params: unknown): void {
    this.socket.send(JSON.stringify({ jsonrpc: "2.0", method, params }));
  }

  waitFor(method: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const listeners = this.notifications.get(method) ?? [];
      const timer = setTimeout(() => {
        this.notifications.set(
          method,
          listeners.filter((listener) => listener !== receive),
        );
        reject(new StageError("handoff", "LLM_UNAVAILABLE", true));
      }, this.timeoutMs);
      const receive = (params: unknown) => {
        clearTimeout(timer);
        resolve(params);
      };
      listeners.push(receive);
      this.notifications.set(method, listeners);
    });
  }

  close(): void {
    this.socket.close();
  }

  private receive(raw: string): void {
    const message = JSON.parse(raw) as unknown;
    if (isNotification(message)) {
      const listeners = this.notifications.get(message.method) ?? [];
      this.notifications.delete(message.method);
      for (const listener of listeners) listener(message.params);
      return;
    }
    const parsed = JsonRpcResponseSchema.safeParse(message);
    if (!parsed.success) return;
    const pending = this.pending.get(parsed.data.id);
    if (pending === undefined) return;
    this.pending.delete(parsed.data.id);
    if (parsed.data.error !== undefined)
      pending.reject(new Error(parsed.data.error.message));
    else pending.resolve(parsed.data.result);
  }

  private rejectAll(error: unknown): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

function isNotification(
  value: unknown,
): value is { method: string; params: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "method" in value &&
    typeof value.method === "string"
  );
}
