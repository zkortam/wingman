import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** The workspace names and the published names differ, because the `@wingman` npm organisation is. */
export const PUBLIC_SCHEMA = '@zkortam/wingman-schema'
export const PUBLIC_SDK = '@zkortam/wingman-sdk'
export const WORKSPACE_SCHEMA = '@wingman/schema'
export const WORKSPACE_SDK = '@wingman/sdk'

export interface Restoration {
  file: string
  contents: Buffer
}

interface Manifest {
  name?: string
  version?: string
  dependencies?: Record<string, string>
  exports?: Record<string, unknown> | string
  main?: string
  types?: string
  publishConfig?: Record<string, unknown>
}

const readManifest = (file: string): Manifest => JSON.parse(readFileSync(file, 'utf8')) as Manifest

const writeManifest = (file: string, manifest: Manifest): void => {
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`)
}

const applyPublicManifest = (
  file: string,
  mutate: (manifest: Manifest) => void,
  restorations: Restoration[],
): void => {
  restorations.push({ file, contents: readFileSync(file) })
  const manifest = readManifest(file)
  mutate(manifest)
  const published = manifest.publishConfig ?? {}
  if (published.exports) manifest.exports = published.exports as Record<string, unknown>
  if (published.main) manifest.main = published.main as string
  if (published.types) manifest.types = published.types as string
  manifest.exports = {
    ...(manifest.exports && typeof manifest.exports === 'object' ? manifest.exports : {}),
    './package.json': './package.json',
  }
  manifest.publishConfig = { access: 'public' }
  writeManifest(file, manifest)
}

const rewriteSchemaImports = (directory: string, restorations: Restoration[]): void => {
  for (const file of readdirSync(directory)) {
    if (!/\.(?:js|d\.ts|map)$/.test(file)) continue
    const path = join(directory, file)
    const original = readFileSync(path, 'utf8')
    const next = original.replaceAll(WORKSPACE_SCHEMA, PUBLIC_SCHEMA)
    if (next === original) continue
    restorations.push({ file: path, contents: readFileSync(path) })
    writeFileSync(path, next)
  }
}

/** Rewrites both package manifests and the SDK's compiled imports to their published identities. */
export const toPublicPackages = (root = '.'): Restoration[] => {
  const restorations: Restoration[] = []
  applyPublicManifest(
    join(root, 'packages/schema/package.json'),
    (manifest) => {
      manifest.name = PUBLIC_SCHEMA
    },
    restorations,
  )
  applyPublicManifest(
    join(root, 'packages/sdk/package.json'),
    (manifest) => {
      manifest.name = PUBLIC_SDK
      const dependencies = manifest.dependencies ?? {}
      const current = dependencies[WORKSPACE_SCHEMA]
      // Rebuilt without the workspace entry rather than deleted, so the published manifest carries only.
      manifest.dependencies = {
        ...Object.fromEntries(
          Object.entries(dependencies).filter(([name]) => name !== WORKSPACE_SCHEMA),
        ),
        [PUBLIC_SCHEMA]: String(current).startsWith('workspace:')
          ? String(manifest.version)
          : String(current),
      }
    },
    restorations,
  )
  rewriteSchemaImports(join(root, 'packages/sdk/dist'), restorations)
  return restorations
}

export const restore = (restorations: Restoration[]): void => {
  for (const { file, contents } of restorations) writeFileSync(file, contents)
}

/** Reads a package's version without going through its `exports` map. */
export const packageVersion = (manifestPath: string): string => {
  const version = readManifest(manifestPath).version
  if (version === undefined) throw new Error(`${manifestPath} has no version`)
  return version
}
