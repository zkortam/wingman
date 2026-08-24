import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'

const WINDOWS = process.platform === 'win32'

/** Windows resolves `pnpm`, `npm`, and most `node_modules/.bin` entries to `.cmd` shims. */
const quoteForWindows = (value: string): string =>
  `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, '$1$1')}"`

export interface RunResult {
  code: number
  stdout: string
  stderr: string
}

export interface RunOptions {
  cwd?: string
  /** Stream child output to this process instead of capturing it. */
  inherit?: boolean
  env?: NodeJS.ProcessEnv
}

/** Runs a command portably and resolves with its exit code and captured output. */
export const run = (
  command: string,
  args: string[],
  options: RunOptions = {},
): Promise<RunResult> =>
  new Promise((resolveRun, reject) => {
    const child = WINDOWS
      ? spawn([command, ...args].map(quoteForWindows).join(' '), {
          shell: true,
          ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
          ...(options.env === undefined ? {} : { env: options.env }),
          stdio: options.inherit ? 'inherit' : 'pipe',
        })
      : spawn(command, args, {
          ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
          ...(options.env === undefined ? {} : { env: options.env }),
          stdio: options.inherit ? 'inherit' : 'pipe',
        })

    let stdout = ''
    let stderr = ''
    child.stdout?.setEncoding('utf8').on('data', (chunk) => (stdout += chunk))
    child.stderr?.setEncoding('utf8').on('data', (chunk) => (stderr += chunk))
    child.once('error', reject)
    child.once('close', (code) => resolveRun({ code: code ?? 1, stdout, stderr }))
  })

/** Runs a command and throws a diagnosable error when it fails, so a broken gate reports the. */
export const runOrThrow = async (
  command: string,
  args: string[],
  options: RunOptions = {},
): Promise<RunResult> => {
  const result = await run(command, args, options)
  if (result.code !== 0) {
    const detail = [result.stdout, result.stderr]
      .filter((part) => part.trim().length > 0)
      .join('\n')
    throw new Error(
      `${command} ${args.join(' ')} exited with ${String(result.code)}${detail ? `\n${detail}` : ''}`,
    )
  }
  return result
}

/** Finds an installed package's directory without going through its `exports` map, which frequently. */
export const findPackageDirectory = (
  packageName: string,
  from = import.meta.dirname,
): string | null => {
  try {
    return dirname(createRequire(from).resolve(`${packageName}/package.json`))
  } catch {
    // Falls through to the directory walk below.
  }
  let directory = resolve(from)
  for (;;) {
    const candidate = join(directory, 'node_modules', ...packageName.split('/'))
    if (existsSync(join(candidate, 'package.json'))) return candidate
    const parent = dirname(directory)
    if (parent === directory) return null
    directory = parent
  }
}

/** Locates a dependency's bin script on disk and runs it with the current Node binary. */
export const runPackageBin = async (
  packageName: string,
  binName: string,
  args: string[],
  options: RunOptions = {},
): Promise<RunResult> => {
  const packageDirectory = findPackageDirectory(packageName)
  if (packageDirectory === null) throw new Error(`${packageName} is not installed`)
  const manifest = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8')) as {
    bin?: string | Record<string, string>
  }
  const entry = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[binName]
  if (entry === undefined) {
    throw new Error(`${packageName} does not expose a "${binName}" bin entry`)
  }
  return run(process.execPath, [resolve(join(packageDirectory, entry)), ...args], options)
}

/** True when a dependency is installed and its files are present on disk. */
export const isPackageInstalled = (packageName: string): boolean =>
  findPackageDirectory(packageName) !== null

/** Returns the command that runs the package manager which invoked this script. */
export const packageManagerCommand = (fallback = 'pnpm'): { command: string; prefix: string[] } => {
  const execPath = process.env.npm_execpath
  if (execPath !== undefined && /\.[cm]?js$/.test(execPath) && existsSync(execPath)) {
    return { command: process.execPath, prefix: [execPath] }
  }
  return { command: fallback, prefix: [] }
}
