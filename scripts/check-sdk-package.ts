import { rmSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { packageManagerCommand, runOrThrow } from './lib/process.ts'
import {
  PUBLIC_SCHEMA,
  PUBLIC_SDK,
  WORKSPACE_SCHEMA,
  restore,
  toPublicPackages,
} from './lib/public-package.ts'
import { readTarGz } from './lib/tar.ts'

// runOrThrow spawns portably (pnpm and npm are .cmd shims on Windows, which Node refuses to spawn.
const execute = (command: string, args: string[], options?: { cwd?: string }) =>
  runOrThrow(command, args, options ?? {})

// Run the *same* package manager that invoked this gate.
const packageManager = packageManagerCommand()
const pnpm = (args: string[], options?: { cwd?: string }) =>
  execute(packageManager.command, [...packageManager.prefix, ...args], options)

const repoRoot = resolve(import.meta.dirname, '..')
const directory = await mkdtemp(join(tmpdir(), 'wingman-package-check-'))

// The clean-consumer check installs a full node_modules tree.
process.on('exit', () => {
  try {
    rmSync(directory, { recursive: true, force: true })
  } catch {
    // A locked file on Windows must not turn a passing gate into a failure.
  }
})

// Pack the packages under their PUBLISHED identities, applying exactly the transform.
const restorations = toPublicPackages(repoRoot)
process.on('exit', () => {
  restore(restorations)
})

await pnpm(['--filter', PUBLIC_SCHEMA, 'pack', '--pack-destination', directory])
await pnpm(['--filter', PUBLIC_SDK, 'pack', '--pack-destination', directory])

const archives = await readdir(directory)
const schemaArchive = required(
  archives.find((file) => file.includes('wingman-schema-') && file.endsWith('.tgz')),
  'schema archive',
)
const sdkArchive = required(
  archives.find((file) => file.includes('wingman-sdk-') && file.endsWith('.tgz')),
  'SDK archive',
)
await inspectArchive(join(directory, schemaArchive))
await inspectArchive(join(directory, sdkArchive))

const consumer = join(directory, 'consumer')
await mkdir(consumer)
await writeFile(
  join(consumer, 'package.json'),
  JSON.stringify({
    private: true,
    type: 'module',
    dependencies: {
      [PUBLIC_SCHEMA]: `file:${join(directory, schemaArchive)}`,
      [PUBLIC_SDK]: `file:${join(directory, sdkArchive)}`,
    },
    pnpm: {
      overrides: {
        [PUBLIC_SCHEMA]: `file:${join(directory, schemaArchive)}`,
      },
    },
  }),
)
await writeFile(
  join(consumer, 'smoke.mjs'),
  [
    `import { ToolCallReviewRequestSchema } from "${PUBLIC_SCHEMA}";`,
    'import {',
    '  Outcome,',
    '  Wingman,',
    '  WingmanClient,',
    '  createAgentReplayHandler,',
    '  createToolMiddleware,',
    '  hashUserId,',
    '  isMcpToolsCallRequest,',
    `} from "${PUBLIC_SDK}";`,
    'if (typeof Wingman.init !== "function") throw new Error("Wingman.init missing");',
    'if (typeof WingmanClient !== "function") throw new Error("WingmanClient missing");',
    'if (Outcome !== Wingman) throw new Error("Outcome alias missing");',
    'if (typeof createToolMiddleware !== "function") throw new Error("createToolMiddleware missing");',
    'if (typeof createAgentReplayHandler !== "function") throw new Error("createAgentReplayHandler missing");',
    'if (typeof isMcpToolsCallRequest !== "function") throw new Error("isMcpToolsCallRequest missing");',
    'if (typeof hashUserId !== "function") throw new Error("hashUserId missing");',
    'if (!/^[a-f0-9]{32}$/.test(hashUserId("salt", "user-1"))) throw new Error("hashUserId width");',
    'if (!ToolCallReviewRequestSchema) throw new Error("review schema missing");',
    'const config = { systemPrompt: "Help.", tools: { lookup: { description: "Look up." } }, retrieval: {}, rules: [] };',
    'const fetcher = async (input, init) => {',
    '  const url = String(input);',
    '  if (url.includes("/v1/reviews/tool-calls")) {',
    '    return Response.json({ action: "ALLOW", reason: "ok", instruction: null, confidence: 1, source: "REMOTE" });',
    '  }',
    '  if (url.includes("/v1/config/")) return new Response("", { status: 503 });',
    '  if (url.includes("/v1/events")) return new Response("", { status: 202 });',
    '  throw new Error(`unexpected ${url}`);',
    '};',
    'const wingman = Wingman.init({',
    '  endpoint: "https://wingman.example",',
    '  apiKey: "key",',
    '  orgId: "5e8e68e1-a768-4342-b4f4-d9a1f8ceaa26",',
    '  orgSalt: "salt",',
    '  signingKey: "signing-key",',
    '  defaultAgent: "4ee0d899-d63d-4bc2-b47a-25aa25c6078b",',
    '  baseConfig: config,',
    '  writable: ["rules"],',
    '  redact: { fields: ["turns"] },',
    '  fetcher,',
    '});',
    'const decision = await wingman.reviewToolCall({',
    '  sessionId: "f561f9b9-2abf-4bb7-a5cd-3b6ad76002b6",',
    '  userId: "user-1",',
    '  userMessage: "Look up the order.",',
    '  proposedCall: { name: "lookup", args: { id: "1" } },',
    '  recentTurns: [],',
    '  context: {},',
    '});',
    'if (decision.action !== "ALLOW") throw new Error("review failed");',
    'const resolved = await wingman.config({ agent: "4ee0d899-d63d-4bc2-b47a-25aa25c6078b", userId: "user-1" });',
    'if (resolved.systemPrompt !== "Help.") throw new Error("config fallback failed");',
    'wingman.observeSession({',
    '  id: "f561f9b9-2abf-4bb7-a5cd-3b6ad76002b6",',
    '  userId: "user-1",',
    '  startedAt: "2026-08-23T20:00:00.000Z",',
    '  turns: [{ idx: 0, role: "user", text: "Look up the order.", toolCalls: [], createdAt: "2026-08-23T20:00:00.000Z" }],',
    '});',
    'await wingman.flush();',
    'if (wingman.observationStats().sent !== 1) throw new Error("observe failed");',
    'const middleware = createToolMiddleware(wingman);',
    'if (typeof middleware.beforeLangChainTool !== "function") throw new Error("middleware missing");',
    'const replay = createAgentReplayHandler({ token: "runner", run: async () => ({ toolCalls: [], text: null, cassetteKey: "host:0" }) });',
    'const replayed = await replay(new Request("https://host/replay", {',
    '  method: "POST",',
    '  headers: { authorization: "Bearer runner" },',
    '  body: JSON.stringify({ config, messages: [], interceptToolCalls: true }),',
    '}));',
    'if (replayed.status !== 200) throw new Error("replay failed");',
  ].join('\n'),
)
await pnpm(['install', '--prefer-offline', '--ignore-scripts', '--frozen-lockfile=false'], {
  cwd: consumer,
})
await execute(process.execPath, ['smoke.mjs'], { cwd: consumer })

// The dist under inspection is the transformed one, so it must already point at the published.
const compiledSdk = await readFile(join(repoRoot, 'packages/sdk/dist/index.js'), 'utf8')
if (!compiledSdk.includes(PUBLIC_SCHEMA)) {
  throw new Error(`SDK dist does not import ${PUBLIC_SCHEMA}`)
}
if (compiledSdk.includes(WORKSPACE_SCHEMA)) {
  throw new Error('SDK dist still references the workspace schema package')
}

process.stdout.write('SDK package contents and clean-consumer import verified.\n')

async function inspectArchive(archive: string): Promise<void> {
  const contents = readTarGz(await readFile(archive))
  const entries = contents.filter((entry) => entry.type === '0').map((entry) => entry.name)
  for (const requiredEntry of [
    'package/LICENSE',
    'package/README.md',
    'package/dist/index.d.ts',
    'package/dist/index.js',
  ]) {
    if (!entries.includes(requiredEntry)) throw new Error(`${archive} is missing ${requiredEntry}`)
  }
  if (entries.some((entry) => /(?:^|\/)(?:src|demo|test|fixtures)(?:\/|\.)/.test(entry)))
    throw new Error(`${archive} contains development-only files`)

  const manifestEntry = contents.find((entry) => entry.name === 'package/package.json')
  if (manifestEntry === undefined) throw new Error(`${archive} has no package.json`)
  const manifest = JSON.parse(manifestEntry.content.toString('utf8')) as {
    private?: boolean
    main?: string
    types?: string
    exports?: Record<string, unknown>
  }
  if (manifest.private === true) throw new Error(`${archive} is private`)
  if (!manifest.exports?.['.']) throw new Error(`${archive} has no root export`)
  if (JSON.stringify(manifest.exports['.']).includes('src/')) {
    throw new Error(`${archive} still exports source files`)
  }
  const root = manifest.exports['.']
  const importPath =
    typeof root === 'string'
      ? root
      : root && typeof root === 'object' && 'import' in root
        ? String((root as { import: string }).import)
        : ''
  if (!importPath.startsWith('./dist/')) {
    throw new Error(`${archive} root import is ${importPath || 'missing'}, expected dist`)
  }
  if (manifest.main !== './dist/index.js') {
    throw new Error(`${archive} main is ${String(manifest.main)}`)
  }
  if (manifest.types !== './dist/index.d.ts') {
    throw new Error(`${archive} types are ${String(manifest.types)}`)
  }
  if (archive.includes('schema') && !manifest.exports?.['./contracts']) {
    throw new Error(`${archive} is missing the contracts export`)
  }
}

function required(value: string | undefined, description: string): string {
  if (value === undefined) throw new Error(`Missing ${description}`)
  return value
}
