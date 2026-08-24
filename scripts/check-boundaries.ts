import { readdir, readFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const sourceRoots = ['packages', 'services', 'apps', 'fixtures']
const sourceExtensions = new Set(['.ts', '.tsx'])

const walk = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  const nested = await Promise.all(
    entries
      .filter((entry) => !['node_modules', '.next', 'coverage', 'dist'].includes(entry.name))
      .map((entry) => {
        const path = join(directory, entry.name)
        return entry.isDirectory() ? walk(path) : Promise.resolve([path])
      }),
  )
  return nested
    .flat()
    .filter((path) => sourceExtensions.has(extname(path)) && !path.includes('.test.'))
}

const imports = (source: string): string[] =>
  [...source.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)].flatMap((match) =>
    match[2] ? [match[2]] : [],
  )

const failures: string[] = []
const files = (
  await Promise.all(sourceRoots.map((directory) => walk(join(root, directory))))
).flat()
const fileSet = new Set(files)
const graph = new Map<string, string[]>()

const resolveLocal = (from: string, target: string): string | undefined => {
  if (!target.startsWith('.')) return undefined
  const base = resolve(dirname(from), target)
  return [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')].find(
    (candidate) => fileSet.has(candidate),
  )
}

for (const file of files) {
  const from = relative(root, file)
  const targets = imports(await readFile(file, 'utf8'))
  graph.set(
    file,
    targets.flatMap((target) => resolveLocal(file, target) ?? []),
  )
  for (const target of targets) {
    if (
      from.startsWith('services/config/') &&
      (target.includes('services/pipeline') || target === '@wingman/pipeline')
    ) {
      failures.push(`${from}: services/config cannot import services/pipeline`)
    }
    if (from.startsWith('apps/web/') && target.includes('@wingman/db')) {
      failures.push(`${from}: apps/web cannot import @wingman/db`)
    }
    if (
      from.startsWith('packages/sdk/') &&
      target.startsWith('@wingman/') &&
      target !== '@wingman/schema'
    ) {
      failures.push(`${from}: packages/sdk may only import @wingman/schema`)
    }
    if (
      from.startsWith('fixtures/') &&
      (/^@wingman\/(?:web|pipeline|config|ingest)$/.test(target) ||
        target.includes('/apps/') ||
        target.includes('/services/'))
    ) {
      failures.push(`${from}: fixtures cannot import an app or service`)
    }
    if (
      from.startsWith('packages/schema/') &&
      (/^@wingman\//.test(target) ||
        target.includes('/packages/') ||
        target.includes('/services/') ||
        target.includes('/apps/') ||
        target.includes('/fixtures/'))
    ) {
      failures.push(`${from}: schema must remain a leaf package`)
    }
    if (/^@wingman\/[^/]+\//.test(target) || /^services\/[^/]+\//.test(target)) {
      failures.push(`${from}: deep package import ${target}`)
    }
  }
}

const visiting = new Set<string>()
const visited = new Set<string>()
const visit = (file: string, path: string[]): void => {
  if (visiting.has(file)) {
    const start = path.indexOf(file)
    failures.push(
      `circular dependency: ${path
        .slice(start)
        .concat(file)
        .map((entry) => relative(root, entry))
        .join(' -> ')}`,
    )
    return
  }
  if (visited.has(file)) return
  visiting.add(file)
  for (const dependency of graph.get(file) ?? []) visit(dependency, [...path, file])
  visiting.delete(file)
  visited.add(file)
}

for (const file of files) visit(file, [])

if (failures.length > 0) throw new Error(failures.join('\n'))
