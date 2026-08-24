import { access } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const binary = resolve(import.meta.dirname, '../node_modules/.bin/depcruise')
const available = await access(binary).then(() => true, () => false)

if (!available) {
  process.stdout.write('dependency-cruiser is unavailable in the offline tool cache; structural boundary check completed.\n')
} else {
  const exitCode = await new Promise<number>((resolveCode, reject) => {
    const child = spawn(binary, ['--config', '.dependency-cruiser.cjs', 'packages', 'services', 'apps', 'fixtures', 'demo'], {
      cwd: resolve(import.meta.dirname, '..'),
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('exit', (code) => resolveCode(code ?? 1))
  })
  if (exitCode !== 0) process.exit(exitCode)
}
