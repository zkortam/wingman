import { resolve } from 'node:path'

import { isPackageInstalled, runPackageBin } from './lib/process.ts'

const root = resolve(import.meta.dirname, '..')

/** A boundary gate that quietly passes when its tool is missing is worse than no gate at all. */
if (!isPackageInstalled('dependency-cruiser')) {
  if (process.env.WINGMAN_SKIP_DEPENDENCY_CRUISER === '1') {
    process.stdout.write(
      'dependency-cruiser is unavailable and WINGMAN_SKIP_DEPENDENCY_CRUISER=1; import-boundary enforcement was SKIPPED.\n',
    )
  } else {
    process.stderr.write(
      'dependency-cruiser is not installed, so import boundaries were not enforced.\n' +
        'Run `pnpm install`, or set WINGMAN_SKIP_DEPENDENCY_CRUISER=1 to accept an unenforced build.\n',
    )
    process.exit(1)
  }
} else {
  const { code } = await runPackageBin(
    'dependency-cruiser',
    'depcruise',
    ['--config', '.dependency-cruiser.cjs', 'packages', 'services', 'apps', 'fixtures', 'demo'],
    { cwd: root, inherit: true },
  )
  if (code !== 0) process.exit(code)
}
