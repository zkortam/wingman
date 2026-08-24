import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Runs prompts through the locally installed Codex CLI.
 *
 * Using the machine's own Codex install means the demo needs no API key and no account
 * setup, which is the difference between a demo that runs anywhere and one that runs on
 * the laptop it was built on. Codex enforces the response shape itself via
 * --output-schema, so nothing here has to coax JSON out of prose.
 */
const CODEX_BIN =
  process.env.CODEX_BIN ?? "/Applications/ChatGPT.app/Contents/Resources/codex";

export const CODEX_MODEL = process.env.CODEX_MODEL ?? "gpt-5.6-sol";

export interface CodexOptions {
  timeoutMs?: number;
}

export async function codexJson<T>(
  prompt: string,
  schema: Record<string, unknown>,
  options: CodexOptions = {},
): Promise<T | null> {
  const dir = mkdtempSync(join(tmpdir(), "wingman-codex-"));
  const schemaPath = join(dir, "schema.json");
  const outPath = join(dir, "out.json");
  writeFileSync(schemaPath, JSON.stringify(schema));

  try {
    const ok = await run(
      [
        "exec",
        "--ephemeral",
        "--skip-git-repo-check",
        "--ignore-user-config",
        "--sandbox",
        "read-only",
        "--model",
        CODEX_MODEL,
        "--output-schema",
        schemaPath,
        "--output-last-message",
        outPath,
        prompt,
      ],
      options.timeoutMs ?? 25_000,
    );
    if (!ok) return null;
    return JSON.parse(readFileSync(outPath, "utf8")) as T;
  } catch {
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function run(args: string[], timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(CODEX_BIN, args, { stdio: ["ignore", "ignore", "ignore"] });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(false);
    }, timeoutMs);
    child.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

export function codexAvailable(): boolean {
  try {
    readFileSync(CODEX_BIN);
    return true;
  } catch {
    return false;
  }
}
