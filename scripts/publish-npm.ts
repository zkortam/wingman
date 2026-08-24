import { resolve } from 'node:path'
import process from 'node:process'

import { runOrThrow } from './lib/process.ts'
import {
  PUBLIC_SCHEMA,
  PUBLIC_SDK,
  packageVersion,
  restore,
  toPublicPackages,
} from './lib/public-package.ts'

const root = resolve(import.meta.dirname, '..')
const schemaVersion = packageVersion(resolve(root, 'packages/schema/package.json'))
const sdkVersion = packageVersion(resolve(root, 'packages/sdk/package.json'))

/** A tag push publishes to npm. */
const tag = process.env.GITHUB_REF_NAME ?? process.env.WINGMAN_RELEASE_TAG
if (tag !== undefined && tag.startsWith('v')) {
  const expected = tag.slice(1)
  for (const [name, version] of [
    [PUBLIC_SCHEMA, schemaVersion],
    [PUBLIC_SDK, sdkVersion],
  ] as const) {
    if (version !== expected) {
      process.stderr.write(
        `Refusing to publish: tag ${tag} does not match ${name}@${version}.\n` +
          `Bump the package version to ${expected}, or tag v${version}.\n`,
      )
      process.exit(1)
    }
  }
}
if (schemaVersion !== sdkVersion) {
  process.stderr.write(
    `Refusing to publish: ${PUBLIC_SCHEMA}@${schemaVersion} and ${PUBLIC_SDK}@${sdkVersion} must be released together at one version.\n`,
  )
  process.exit(1)
}

const restorations = toPublicPackages(root)
const args = ['publish', '--access', 'public', '--ignore-scripts']
if (process.env.GITHUB_ACTIONS) args.push('--provenance')

try {
  await runOrThrow('npm', args, { cwd: resolve(root, 'packages/schema'), inherit: true })
  await runOrThrow('npm', args, { cwd: resolve(root, 'packages/sdk'), inherit: true })
  process.stdout.write(`Published ${PUBLIC_SCHEMA} and ${PUBLIC_SDK} at ${schemaVersion}.\n`)
} finally {
  restore(restorations)
}
