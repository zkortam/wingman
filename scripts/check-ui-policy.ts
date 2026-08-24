import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const web = join(root, 'apps/web')

const walk = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true })
  return (
    await Promise.all(
      entries
        .filter((entry) => !['.next', 'node_modules'].includes(entry.name))
        .map((entry) =>
          entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)],
        ),
    )
  ).flat()
}

const files = await walk(web)
const sourceFiles = files.filter(
  (file) => ['.css', '.ts', '.tsx'].includes(extname(file)) && !file.includes('.test.'),
)
const failures: string[] = []
const bannedCopy = /powered by AI|intelligent|smart|seamlessly|supercharge|leverage|unlock|lorem/i

for (const file of sourceFiles) {
  const source = await readFile(file, 'utf8')
  const name = relative(root, file)
  if (bannedCopy.test(source)) failures.push(`${name}: banned product copy`)
  if ([...source].some((character) => character.charCodeAt(0) > 127))
    failures.push(`${name}: product source must use ASCII text`)
  if (extname(file) === '.tsx' && /style\s*=\s*\{\{/.test(source))
    failures.push(`${name}: inline styles are forbidden`)
  if (extname(file) !== '.css') continue
  if (/gradient\s*\(/i.test(source)) failures.push(`${name}: gradients are forbidden`)
  if (/(?:box|text)-shadow\s*:/i.test(source)) failures.push(`${name}: shadows are forbidden`)
  if (!file.endsWith('tokens.css') && /#[\da-f]{3,8}\b/i.test(source))
    failures.push(`${name}: raw colors belong in tokens.css`)
  for (const match of source.matchAll(/(?:transition|animation)[^;]*?(\d+)ms/gi)) {
    if (Number(match[1]) > 150) failures.push(`${name}: motion exceeds 150ms`)
  }
}

/** The design system stays small because every primitive is covered and none of them reaches back. */
const primitives = files.filter(
  (file) =>
    file.startsWith(join(web, 'src/ui/')) && file.endsWith('.tsx') && !file.endsWith('.test.tsx'),
)
for (const primitive of primitives) {
  const name = relative(root, primitive)
  if (!files.includes(primitive.replace(/\.tsx$/, '.test.tsx'))) {
    failures.push(`${name}: a UI primitive needs a colocated test`)
  }
  const source = await readFile(primitive, 'utf8')
  // Type-only imports of a domain view model are what a presentational component renders, so only.
  const runtimeImports = [...source.matchAll(/(?<!import type )from ['"]([^'"]+)['"]/g)]
    .flatMap((match) => (match[1] === undefined ? [] : [match[1]]))
    .filter((specifier) => /^\.\.\/(?:features|data|server)\//.test(specifier))
  if (runtimeImports.length > 0) {
    failures.push(`${name}: a UI primitive must not import ${runtimeImports.join(', ')} at runtime`)
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n')}\n`)
  process.exit(1)
}
