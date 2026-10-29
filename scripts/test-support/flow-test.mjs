import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stopTestProcesses } from '../stop-test-processes.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function requireFreePort(port) {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', (error) => reject(new Error(`Porta ${port} indisponível: ${error.code}. Encerre somente a execução que a ocupa.`, { cause: error })))
    server.listen({ host: '127.0.0.1', port, exclusive: true }, resolve)
  })
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}

export function createFlowTest(name, { timeout = 45000 } = {}) {
  const temp = mkdtempSync(join(tmpdir(), `na-${name}-flow-`))
  const origin = 'http://127.0.0.1:3011'
  const token = randomBytes(32).toString('base64url')
  const password = randomBytes(24).toString('base64url')
  const secrets = new Set([token, password])
  const processes = []
  const logs = []
  const runtimeErrors = []
  const pending = new Map()
  let socket
  let sequence = 0
  let failure
  let closing = false
  let stage = 'preparação'

  const redact = (value) => {
    let text = String(value)
    for (const secret of secrets) if (secret) text = text.replaceAll(secret, '[redigido]')
    return text.replace(/((?:"?(?:csrf_token|password|cookie|set-cookie|x-csrf-token|x-bootstrap-token)"?)\s*[:=]\s*)("[^"]*"|[^\s,;}]+)/gi, '$1[redigido]')
  }
  const record = (value) => {
    logs.push(redact(value).slice(-4000))
    if (logs.length > 20) logs.shift()
  }
  function launch(command, args, environment = {}) {
    const child = spawn(command, args, {
      cwd: root, env: { ...process.env, ...environment },
      stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32',
    })
    child.testProcessGroup = process.platform !== 'win32'
    child.on('error', (error) => { failure = new Error(`Não foi possível iniciar ${command}: ${error.message}`, { cause: error }) })
    child.on('exit', (code, signal) => {
      if (!closing) failure = new Error(`Processo ${command} encerrou antes do fim: código ${code}, sinal ${signal ?? 'nenhum'}`)
    })
    child.stdout.on('data', record)
    child.stderr.on('data', record)
    processes.push(child)
    return child
  }
  async function until(fn, label, wait = timeout) {
    stage = label
    const deadline = Date.now() + wait
    let lastError
    while (Date.now() < deadline) {
      if (failure) throw failure
      try { const result = await fn(); if (result) return result } catch (error) { lastError = error }
      await sleep(150)
    }
    throw new Error(`Tempo esgotado: ${label}${lastError ? `. Última causa: ${redact(lastError.message)}` : ''}`, { cause: lastError })
  }
  async function request(path, data, auth, extra = {}) {
    stage = `API ${path}`
    const response = await fetch(`${origin}/api/v1${path}`, {
      method: data ? 'POST' : 'GET',
      headers: { Origin: origin, 'Content-Type': 'application/json', ...(auth ? { Cookie: auth.cookie, 'X-CSRF-Token': auth.csrf } : {}), ...extra },
      body: data ? JSON.stringify(data) : undefined,
      signal: AbortSignal.timeout(10000),
    })
    const body = await response.json()
    const cookie = response.headers.get('set-cookie')?.split(';')[0]
    if (cookie) secrets.add(cookie)
    if (body.csrf_token) secrets.add(body.csrf_token)
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${redact(body.message ?? '')}`)
    return { body, cookie }
  }
  async function startBackend() {
    stage = 'inicialização da API isolada'
    await requireFreePort(3011)
    await requireFreePort(9224)
    if (!existsSync(join(root, 'dist/index.html'))) throw new Error('Interface compilada ausente. Execute npm run build antes do fluxo.')
    launch(process.env.NABARBEARIA_TEST_BACKEND ?? 'cargo', process.env.NABARBEARIA_TEST_BACKEND ? [] : ['run', '--locked', '--manifest-path', 'backend/Cargo.toml'], {
      NABARBEARIA_BIND: '127.0.0.1:3011', NABARBEARIA_DB_PATH: join(temp, 'test.db'),
      NABARBEARIA_FRONTEND_DIR: join(root, 'dist'), NABARBEARIA_BOOTSTRAP_TOKEN: token,
      NABARBEARIA_ALLOWED_ORIGINS: origin, NABARBEARIA_SECURE_COOKIES: 'false',
    })
    await until(async () => {
      const response = await fetch(`${origin}/api/v1/health`, { signal: AbortSignal.timeout(2000) })
      return response.ok && (await response.json()).status === 'ok'
    }, 'API isolada', 120000)
  }
  function rejectPending(error) {
    for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(error) }
    pending.clear()
  }
  async function startBrowser() {
    stage = 'inicialização do Chrome'
    await requireFreePort(9224)
    const chrome = process.env.CHROME_BIN ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'google-chrome')
    launch(chrome, ['--headless', '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--remote-debugging-port=9224', `--user-data-dir=${join(temp, 'chrome')}`, 'about:blank'])
    const target = await until(async () => {
      const response = await fetch('http://127.0.0.1:9224/json/list', { signal: AbortSignal.timeout(2000) })
      return (await response.json()).find((item) => item.type === 'page')
    }, 'Chrome')
    socket = new WebSocket(target.webSocketDebuggerUrl)
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params.exceptionDetails.text)
      const entry = pending.get(message.id)
      if (entry) {
        clearTimeout(entry.timer); pending.delete(message.id)
        message.error ? entry.reject(new Error(message.error.message)) : entry.resolve(message.result)
      }
    })
    socket.addEventListener('close', () => rejectPending(new Error('Conexão com Chrome encerrada')))
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Tempo esgotado ao conectar ao Chrome')), 10000)
      socket.addEventListener('open', () => { clearTimeout(timer); resolve() }, { once: true })
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Falha ao conectar ao Chrome')) }, { once: true })
    })
  }
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) return reject(new Error('Chrome não conectado'))
      const id = ++sequence
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Tempo esgotado: CDP ${method}`)) }, 20000)
      pending.set(id, { resolve, reject, timer })
      socket.send(JSON.stringify({ id, method, params }))
    })
  }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
    return result.result?.value
  }
  async function reportFailure(error) {
    console.error(redact(`[${name}] ${stage}: ${error.message}`))
    if (socket?.readyState === WebSocket.OPEN) {
      try {
        console.error(redact(await evaluate('document.body.innerText')))
        const capture = await send('Page.captureScreenshot', { format: 'png' })
        writeFileSync(join(temp, 'failure.png'), Buffer.from(capture.data, 'base64'))
      } catch (captureError) { console.error(redact(`Captura indisponível: ${captureError.message}`)) }
    }
    console.error(logs.slice(-3).join('').slice(-2500))
    console.error(`Evidências: ${temp}`)
  }
  async function close() {
    closing = true
    rejectPending(new Error('Execução encerrada'))
    socket?.close()
    await stopTestProcesses(processes)
  }
  return { root, temp, origin, token, password, runtimeErrors, until, request, startBackend, startBrowser, send, evaluate, reportFailure, close }
}
