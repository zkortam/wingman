import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const web = join(root, 'apps/web')

const walk = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(entries
    .filter((entry) => !['.next', 'node_modules'].includes(entry.name))
    .map((entry) => entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)]))).flat()
}

const files = await walk(web)
const sourceFiles = files.filter((file) => ['.css', '.ts', '.tsx'].includes(extname(file)) && !file.includes('.test.'))
const failures: string[] = []
const bannedCopy = /powered by AI|intelligent|smart|seamlessly|supercharge|leverage|unlock|lorem/i

for (const file of sourceFiles) {
  const source = await readFile(file, 'utf8')
  const name = relative(root, file)
  if (bannedCopy.test(source)) failures.push(`${name}: banned product copy`)
  if ([...source].some((character) => character.charCodeAt(0) > 127)) failures.push(`${name}: product source must use ASCII text`)
  if (extname(file) === '.tsx' && /style\s*=\s*\{\{/.test(source)) failures.push(`${name}: inline styles are forbidden`)
  if (extname(file) !== '.css') continue
  if (/gradient\s*\(/i.test(source)) failures.push(`${name}: gradients are forbidden`)
  if (/(?:box|text)-shadow\s*:/i.test(source)) failures.push(`${name}: shadows are forbidden`)
  if (!file.endsWith('tokens.css') && /#[\da-f]{3,8}\b/i.test(source)) failures.push(`${name}: raw colors belong in tokens.css`)
  for (const match of source.matchAll(/(?:transition|animation)[^;]*?(\d+)ms/gi)) {
    if (Number(match[1]) > 150) failures.push(`${name}: motion exceeds 150ms`)
  }
}

const primitives = files.filter((file) => file.startsWith(join(web, 'src/ui/')) && file.endsWith('.tsx') && !file.endsWith('.test.tsx'))
if (primitives.length !== 15) failures.push(`apps/web/src/ui: expected 15 primitives, found ${String(primitives.length)}`)

if (failures.length > 0) throw new Error(failures.join('\n'))
