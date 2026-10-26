import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { stopTestProcesses } from './stop-test-processes.mjs'
import { randomBytes } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const temp = mkdtempSync(join(tmpdir(), 'na-staff-flow-'))
const origin = 'http://127.0.0.1:3011'
const token = randomBytes(32).toString('hex')
const password = randomBytes(24).toString('base64url')
const processes = []
const logs = []
let socket
let evaluate
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(fn, label, timeout = 60000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try { const result = await fn(); if (result) return result } catch {}
    await pause(150)
  }
  throw new Error(`Tempo esgotado: ${label}`)
}
function launch(command, args, environment = {}) {
  const child = spawn(command, args, { cwd: root, env: { ...process.env, ...environment }, stdio: ['ignore', 'pipe', 'pipe'] })
  child.on('error', (error) => logs.push(error.message))
  child.stderr.on('data', (chunk) => logs.push(chunk.toString()))
  processes.push(child)
}
async function request(path, data, auth, extra = {}) {
  const response = await fetch(`${origin}/api/v1${path}`, {
    method: data ? 'POST' : 'GET',
    headers: { Origin: origin, 'Content-Type': 'application/json', ...(auth ? { Cookie: auth.cookie, 'X-CSRF-Token': auth.csrf } : {}), ...extra },
    body: data ? JSON.stringify(data) : undefined,
  })
  const body = await response.json()
  assert(response.ok, `${path}: ${response.status}`)
  return { body, cookie: response.headers.get('set-cookie')?.split(';')[0] }
}
try {
  launch(process.env.NABARBEARIA_TEST_BACKEND ?? 'cargo', process.env.NABARBEARIA_TEST_BACKEND ? [] : ['run', '--manifest-path', 'backend/Cargo.toml'], {
    NABARBEARIA_BIND: '127.0.0.1:3011', NABARBEARIA_DB_PATH: join(temp, 'test.db'),
    NABARBEARIA_FRONTEND_DIR: join(root, 'dist'), NABARBEARIA_BOOTSTRAP_TOKEN: token,
    NABARBEARIA_ALLOWED_ORIGINS: origin, NABARBEARIA_SECURE_COOKIES: 'false',
  })
  await until(async () => (await fetch(`${origin}/api/v1/health`)).ok, 'API isolada', 120000)
  const setup = await request('/setup/owner', { business_name: 'NA Teste', timezone: 'America/Sao_Paulo', email: 'owner@staff-flow.test', password, display_name: 'Dono Teste' }, null, { 'X-Bootstrap-Token': token })
  await request('/admin/barbers', { email: 'barber@staff-flow.test', password, display_name: 'Barbeiro Teste' }, { cookie: setup.cookie, csrf: setup.body.csrf_token })
  await request('/auth/register', { email: 'client@staff-flow.test', password, display_name: 'Cliente Teste' })
  launch(process.env.CHROME_BIN ?? 'google-chrome', ['--headless', '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--remote-debugging-port=9224', `--user-data-dir=${join(temp, 'chrome')}`, 'about:blank'])
  const target = await until(async () => (await (await fetch('http://127.0.0.1:9224/json/list')).json()).find((item) => item.type === 'page'), 'Chrome')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let sequence = 0
  const pending = new Map()
  const errors = []
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text)
    if (pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id)
      clearTimeout(timer); pending.delete(message.id)
      if (message.error) reject(new Error(message.error.message))
      else resolve(message.result)
    }
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(method)) }, 20000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params }))
  })
  evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
    return result.result?.value
  }
  const text = () => evaluate('document.body.innerText')
  const waitText = (value) => until(async () => (await text()).includes(value), value)
  const navigate = (path) => send('Page.navigate', { url: origin + path })
  const click = async (label) => {
    await until(() => evaluate(`Boolean([...document.querySelectorAll('button')].find(b => !b.disabled && b.textContent.trim() === ${JSON.stringify(label)}))`), label)
    await evaluate(`[...document.querySelectorAll('button')].find(b => !b.disabled && b.textContent.trim() === ${JSON.stringify(label)}).click()`)
  }
  const login = async (email) => {
    await evaluate(`(() => {
      for (const [name, value] of ${JSON.stringify([['email', ''], ['password', password]])}) {
        const input = document.querySelector('input[name="' + name + '"]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, name === 'email' ? ${JSON.stringify(email)} : value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`)
    await click('Entrar')
  }
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Network.enable')
  await navigate('/login')
  await waitText('Cadastre-se')
  assert((await text()).includes('Continuar como visitante'))
  await navigate('/equipe')
  await waitText('Acesso da equipe')
  assert.equal(await evaluate('location.pathname'), '/equipe/login')
  for (const forbidden of ['Cadastre-se', 'Continuar como visitante', 'Continuar com o Google']) assert(!(await text()).includes(forbidden))
  await login('client@staff-flow.test')
  await waitText('Este acesso é exclusivo')
  assert.equal(await evaluate('location.pathname'), '/equipe/login')
  await login('barber@staff-flow.test')
  await waitText('Barbeiro Teste')
  assert.equal(await evaluate('location.pathname'), '/equipe/barbeiro')
  await send('Page.reload')
  await waitText('Barbeiro Teste')
  await click('Perfil')
  await click('Sair da conta')
  await waitText('Acesso da equipe')
  await navigate('/equipe/barbeiro')
  await waitText('Acesso da equipe')
  await login('owner@staff-flow.test')
  await waitText('Painel de Gestão')
  assert.equal(await evaluate('location.pathname'), '/equipe/gestao/financeiro')
  await send('Page.reload')
  await waitText('Painel de Gestão')
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  await evaluate("window.dispatchEvent(new Event('staff-resume'))")
  await waitText('Não foi possível conectar')
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  await click('Tentar novamente')
  await waitText('Painel de Gestão')
  await navigate('/equipe/download')
  await waitText('Baixar APK Android')
  await evaluate(`(async () => {
    const session = await (await fetch('/api/v1/auth/session')).json();
    await fetch('/api/v1/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf_token }, body: '{}' });
    window.dispatchEvent(new Event('staff-resume'));
  })()`)
  await waitText('Acesso da equipe')
  assert.equal(await evaluate('location.pathname'), '/equipe/login')
  assert.deepEqual(errors, [])
  console.log('OK: site público preservado; equipe recusa cliente; barbeiro/dono, sessão, logout, revogação, download e recuperação de rede verificados.')
} catch (error) {
  console.error(error.message)
  if (evaluate) console.error(await evaluate('document.body.innerText').catch(() => 'Página indisponível'))
  console.error(logs.slice(-3).join('').slice(-1500))
  process.exitCode = 1
} finally {
  socket?.close()
  stopTestProcesses(processes)
}
