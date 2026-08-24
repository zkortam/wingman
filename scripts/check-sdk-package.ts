import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const directory = await mkdtemp(join(tmpdir(), "wingman-package-check-"));

await execute("pnpm", [
  "--filter",
  "@wingman/schema",
  "pack",
  "--pack-destination",
  directory,
]);
await execute("pnpm", [
  "--filter",
  "@wingman/sdk",
  "pack",
  "--pack-destination",
  directory,
]);

const archives = await readdir(directory);
const schemaArchive = required(
  archives.find((file) => file.startsWith("wingman-schema-") && file.endsWith(".tgz")),
  "schema archive",
);
const sdkArchive = required(
  archives.find((file) => file.startsWith("wingman-sdk-") && file.endsWith(".tgz")),
  "SDK archive",
);
await inspectArchive(join(directory, schemaArchive));
await inspectArchive(join(directory, sdkArchive));

const consumer = join(directory, "consumer");
await mkdir(consumer);
await writeFile(
  join(consumer, "package.json"),
  JSON.stringify({
    private: true,
    type: "module",
    dependencies: {
      "@wingman/schema": `file:${join(directory, schemaArchive)}`,
      "@wingman/sdk": `file:${join(directory, sdkArchive)}`,
    },
    pnpm: {
      overrides: {
        "@wingman/schema": `file:${join(directory, schemaArchive)}`,
      },
    },
  }),
);
await writeFile(
  join(consumer, "smoke.mjs"),
  [
    'import { ToolCallReviewRequestSchema } from "@wingman/schema";',
    'import { Wingman, WingmanClient } from "@wingman/sdk";',
    'if (typeof Wingman.init !== "function") throw new Error("Wingman.init missing");',
    'if (typeof WingmanClient !== "function") throw new Error("WingmanClient missing");',
    'if (!ToolCallReviewRequestSchema) throw new Error("review schema missing");',
  ].join("\n"),
);
await execute(
  "pnpm",
  ["install", "--prefer-offline", "--ignore-scripts", "--frozen-lockfile=false"],
  { cwd: consumer },
);
await execute(process.execPath, ["smoke.mjs"], { cwd: consumer });
process.stdout.write("SDK package contents and clean-consumer import verified.\n");

async function inspectArchive(archive: string): Promise<void> {
  const { stdout: listing } = await execute("tar", ["-tzf", archive]);
  const entries = listing.trim().split("\n");
  for (const requiredEntry of [
    "package/LICENSE",
    "package/README.md",
    "package/dist/index.d.ts",
    "package/dist/index.js",
  ]) {
    if (!entries.includes(requiredEntry))
      throw new Error(`${archive} is missing ${requiredEntry}`);
  }
  if (entries.some((entry) => /(?:^|\/)(?:src|demo|test|fixtures)(?:\/|\.)/.test(entry)))
    throw new Error(`${archive} contains development-only files`);

  const { stdout: manifestText } = await execute("tar", [
    "-xOf",
    archive,
    "package/package.json",
  ]);
  const manifest = JSON.parse(manifestText) as {
    private?: boolean;
    exports?: Record<string, unknown>;
  };
  if (manifest.private === true) throw new Error(`${archive} is private`);
  if (!manifest.exports?.["."]) throw new Error(`${archive} has no root export`);
}

function required(value: string | undefined, description: string): string {
  if (value === undefined) throw new Error(`Missing ${description}`);
  return value;
}
