import { randomBytes } from 'node:crypto'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

const root = fileURLToPath(new URL('../', import.meta.url))
const envPath = new URL('../backend/.env', import.meta.url)
const localEnv = existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8')) : {}
const env = { ...localEnv, ...process.env }

if (!env.NABARBEARIA_BOOTSTRAP_TOKEN) {
  env.NABARBEARIA_BOOTSTRAP_TOKEN = randomBytes(32).toString('base64url')
  appendFileSync(envPath, `\nNABARBEARIA_BOOTSTRAP_TOKEN=${env.NABARBEARIA_BOOTSTRAP_TOKEN}\n`, { mode: 0o600 })
  console.info('Configuração local criada em backend/.env (ignorada pelo Git).')
}

const child = spawn('cargo', ['run', '--manifest-path', 'backend/Cargo.toml'], {
  cwd: root,
  env,
  stdio: 'inherit',
})
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { if (!child.killed) child.kill(signal) })
}
child.on('error', (error) => {
  console.error(`Não foi possível iniciar o backend: ${error.message}`)
  process.exitCode = 1
})
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0) })
