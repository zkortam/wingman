import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const address = process.env.OUTCOME_DEMO_URL ?? 'http://127.0.0.1:3000/demo'
const server = spawn('pnpm', ['--filter', '@outcome/web', 'dev', '--hostname', '127.0.0.1'], {
  env: { ...process.env, OUTCOME_DEMO_RUN_ID: randomUUID() },
  stdio: ['inherit', 'pipe', 'inherit'],
})

let opened = false
server.stdout?.on('data', (chunk: Buffer) => {
  const output = chunk.toString()
  process.stdout.write(output)
  if (!opened && /ready/i.test(output)) {
    opened = true
    if (process.platform === 'darwin') spawn('open', [address], { detached: true, stdio: 'ignore' }).unref()
    process.stdout.write(`Demo windows: ${address}\n`)
  }
})

const stop = (): void => {
  server.kill('SIGTERM')
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
server.on('exit', (code) => { process.exitCode = code ?? 0 })
