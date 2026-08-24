import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'

import { packageManagerCommand, run } from './lib/process.ts'

const address = process.env.WINGMAN_DEMO_URL ?? 'http://127.0.0.1:3000/demo'

// Use the package manager that started this script rather than resolving "pnpm" from PATH, which.
const packageManager = packageManagerCommand()
const server = spawn(
  packageManager.command,
  [...packageManager.prefix, '--filter', '@wingman/web', 'dev', '--hostname', '127.0.0.1'],
  {
    env: { ...process.env, WINGMAN_DEMO_RUN_ID: randomUUID(), WINGMAN_RUNTIME: 'demo' },
    stdio: ['inherit', 'pipe', 'inherit'],
    shell: packageManager.prefix.length === 0 && process.platform === 'win32',
  },
)

/** Opens the demo in the operator's default browser on every desktop platform. */
const openBrowser = (url: string): void => {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]]
  void run(command, args).catch(() => {
    // A missing browser opener must not take the demo server down.
  })
}

let opened = false
server.stdout?.on('data', (chunk: Buffer) => {
  const output = chunk.toString()
  process.stdout.write(output)
  if (!opened && /ready/i.test(output)) {
    opened = true
    openBrowser(address)
    process.stdout.write(`Demo windows: ${address}\n`)
  }
})

/** Next spawns its own workers. */
const stop = (): void => {
  if (server.exitCode !== null || server.signalCode !== null) return
  if (process.platform === 'win32' && server.pid !== undefined) {
    void run('taskkill', ['/pid', String(server.pid), '/t', '/f']).catch(() => {
      server.kill('SIGKILL')
    })
    return
  }
  server.kill('SIGTERM')
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
process.on('exit', stop)
server.on('exit', (code) => {
  process.exitCode = code ?? 0
})
