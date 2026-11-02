import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// Exercise the production module graph: Vite's dev server does not prove that
// dashboards stay outside the landing page's initial download.
const root = fileURLToPath(new URL('../', import.meta.url))
const dist = resolve(root, 'dist')
const manifestPath = join(dist, '.vite', 'manifest.json')
assert.ok(existsSync(manifestPath), 'Execute npm run build com build.manifest habilitado antes deste teste.')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const sources = {
  public: 'src/PublicApp.tsx',
  staff: 'src/StaffApp.tsx',
  styleguide: 'src/StyleguideApp.tsx',
  client: 'src/ClientApp.tsx',
  owner: 'src/pages/OwnerDashboard.tsx',
  barber: 'src/pages/BarberDashboard.jsx',
}
const chunks = Object.fromEntries(Object.entries(sources).map(([name, source]) => {
  const sourceKey = Object.keys(manifest).find((candidate) => candidate.replaceAll('\\', '/').endsWith(source))
  // Rollup can promote a dynamically imported source that is also shared by
  // another route to an internal key. Keep resolving the actual emitted chunk,
  // and require a unique dynamic entry instead of guessing its hashed filename.
  const namedEntries = Object.keys(manifest).filter((candidate) => manifest[candidate].name === basename(source, extname(source)) && manifest[candidate].isDynamicEntry)
  if (!sourceKey) assert.equal(namedEntries.length, 1, `Manifest deve identificar uma única entrada dinâmica para ${source}`)
  const key = sourceKey ?? namedEntries[0]
  assert.ok(key, `Manifest deve conter entrada separada para ${source}`)
  assert.equal(manifest[key].isDynamicEntry, true, `${source} deve permanecer uma entrada dinâmica.`)
  return [name, { key, path: `/${manifest[key].file}` }]
}))
const entry = Object.keys(manifest).find((key) => manifest[key].isEntry)
assert.ok(entry, 'Manifest deve conter a entrada principal.')
const initialFiles = new Set()
function collectStaticImports(key) {
  const chunk = manifest[key]
  assert.ok(chunk, `Import do manifest ausente: ${key}`)
  if (initialFiles.has(chunk.file)) return
  initialFiles.add(chunk.file)
  for (const imported of chunk.imports ?? []) collectStaticImports(imported)
}
collectStaticImports(entry)
for (const [name, chunk] of Object.entries(chunks)) {
  assert.ok(!initialFiles.has(chunk.path.slice(1)), `${name} não pode integrar os imports estáticos da entrada.`)
}

const artifacts = mkdtempSync(join(tmpdir(), 'na-route-loading-'))
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
const requests = []
const network = []
const responses = []
const finishedRequests = new Set()
const checks = []
const held = new Set()
let scenario = null
let authenticatedBarber = false
let holdDashboardData = false
const barberSession = {
  user: { id: 'qa-route-barber', business_id: 'qa-route-business', email: 'barber@route-loading.test', display_name: 'Barbeiro Rotas', roles: ['barber'] },
  csrf_token: 'route-loading-test-csrf-token',
  expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
}
let socket
let chrome
let commandSequence = 0
const pending = new Map()
const json = (response, status, value) => {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(value))
}
const holdResponse = (pathname, response, body, contentType) => {
  // Flush no-store headers now; holding headers makes Chrome's cache lock
  // serialize later requests, which is not the route behavior being tested.
  response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' })
  response.flushHeaders()
  const heldResponse = { pathname, response, body }
  held.add(heldResponse)
  response.once('close', () => held.delete(heldResponse))
}
const server = createServer((request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname
  requests.push({ path: pathname, scenario: scenario?.label ?? null, authenticatedBarber })
  if (pathname === '/api/v1/auth/session') {
    return authenticatedBarber ? json(response, 200, barberSession) : json(response, 401, { code: 'UNAUTHORIZED', message: 'Sessão de teste ausente.' })
  }
  if (pathname === '/api/v1/public/services' || pathname === '/api/v1/public/barbers') return json(response, 200, [])
  if (pathname === '/api/v1/appointments' || pathname === '/api/v1/barber/blocks') {
    if (holdDashboardData) return holdResponse(pathname, response, '[]', 'application/json')
    return json(response, 200, [])
  }
  if (pathname.startsWith('/api/')) return json(response, 404, { message: 'Endpoint não simulado neste teste de rotas.' })
  let file
  try { file = resolve(dist, `.${decodeURIComponent(pathname)}`) }
  catch { response.writeHead(400); response.end(); return }
  if (file !== dist && !file.startsWith(`${dist}${sep}`)) { response.writeHead(403); response.end(); return }
  if (!extname(pathname)) file = join(dist, 'index.html')
  if (!existsSync(file) || !statSync(file).isFile()) { response.writeHead(404); response.end(); return }
  const contentType = ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' })[extname(file)] ?? 'application/octet-stream'
  if (scenario?.path === pathname && (scenario.kind === 'fail' || !scenario.used)) {
    scenario.used = true
    if (scenario.kind === 'fail') {
      response.writeHead(503, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' })
      response.end('Temporary test failure')
      return
    }
    return holdResponse(pathname, response, readFileSync(file), contentType)
  }
  response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' })
  response.end(readFileSync(file))
})
function releaseHeld() {
  for (const { response, body } of held) if (!response.destroyed && !response.writableEnded) response.end(body)
  held.clear()
}
async function untilNode(predicate, label, timeout = 12000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (predicate()) return
    await sleep(80)
  }
  throw new Error(`Tempo esgotado: ${label}`)
}
function send(method, params = {}) {
  return new Promise((resolvePromise, reject) => {
    const id = ++commandSequence
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP sem resposta: ${method}`)) }, 10000)
    pending.set(id, { resolve: resolvePromise, reject, timer })
    socket.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
async function until(expression, label) {
  const deadline = Date.now() + 12000
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return
    await sleep(80)
  }
  const state = await evaluate('({url:location.href,text:document.body.innerText.slice(0,1200),ready:document.documentElement.dataset.naReady})')
  throw new Error(`Tempo esgotado: ${label}\n${JSON.stringify(state)}`)
}
async function click(selector) {
  const point = await evaluate(`(() => {
    const target = document.querySelector(${JSON.stringify(selector)});
    if (!target) throw new Error('Alvo ausente: ' + ${JSON.stringify(selector)});
    target.scrollIntoView({block:'center',behavior:'instant'});
    const rect = target.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    if (!target.contains(document.elementFromPoint(x,y))) throw new Error('Alvo encoberto');
    return {x,y};
  })()`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 })
}
const login = 'Boolean(document.querySelector("input[type=email]"))'
const landing = 'Boolean(document.querySelector(".public-site .public-hero"))'
const styleguide = 'document.body.innerText.includes("Design Tokens & Styleguide")'
const routeError = 'document.body.innerText.includes("Não foi possível abrir esta página")'
const barberDashboard = 'document.querySelector(".barber-dashboard h1")?.textContent === "Olá, Barbeiro Rotas!"'
const nativeReady = 'document.documentElement.dataset.naReady === "true"'
function assertNotRequested(names, start, label) {
  const paths = network.slice(start).map((request) => request.path)
  for (const name of names) assert.ok(!paths.includes(chunks[name].path), `${label}: download inesperado de ${name}.`)
}
function assertRequested(name, start, label) {
  assert.ok(network.slice(start).some((request) => request.path === chunks[name].path), `${label}: chunk ${name} não foi solicitado.`)
}
function assertResponse(name, start, status, label) {
  const requestIds = new Set(network.slice(start).filter((request) => request.path === chunks[name].path).map((request) => request.id))
  assert.ok(responses.some((response) => requestIds.has(response.id) && response.status === status), `${label}: resposta HTTP ${status} de ${name} deve ter sido observada pelo navegador.`)
}
async function spaNavigate(path) {
  await evaluate(`history.pushState({},'',${JSON.stringify(path)});window.dispatchEvent(new Event('popstate'))`)
}

try {
  await new Promise((resolvePromise, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolvePromise) })
  const origin = `http://127.0.0.1:${server.address().port}`
  const executable = process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  assert.ok(existsSync(executable), `Chrome não encontrado: ${executable}; configure CHROME_BIN.`)
  let launchError
  chrome = spawn(executable, ['--headless', '--no-first-run', '--hide-scrollbars', '--remote-debugging-port=0', `--user-data-dir=${artifacts}`, 'about:blank'], { stdio: 'ignore' })
  chrome.once('error', (error) => { launchError = error })
  const portFile = join(artifacts, 'DevToolsActivePort')
  await untilNode(() => { if (launchError) throw launchError; return existsSync(portFile) }, 'Chrome iniciou')
  const port = readFileSync(portFile, 'utf8').split('\n')[0].trim()
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(10000) })).json()
  const target = targets.find((item) => item.type === 'page')
  assert.ok(target, 'Chrome deve expor uma página de teste.')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket CDP não abriu.')), 10000)
    socket.addEventListener('open', () => { clearTimeout(timer); resolvePromise() }, { once: true })
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Falha WebSocket CDP.')) }, { once: true })
  })
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const command = pending.get(message.id)
      if (!command) return
      clearTimeout(command.timer)
      pending.delete(message.id)
      if (message.error) command.reject(new Error(JSON.stringify(message.error)))
      else command.resolve(message.result)
    }
    if (message.method === 'Network.requestWillBeSent') {
      const { request, type } = message.params
      const url = new URL(request.url)
      if (url.origin === origin) network.push({ id: message.params.requestId, path: url.pathname, url: request.url, type })
    }
    if (message.method === 'Network.loadingFinished') finishedRequests.add(message.params.requestId)
    if (message.method === 'Network.responseReceived') {
      const { response, requestId } = message.params
      const url = new URL(response.url)
      if (url.origin === origin) responses.push({ id: requestId, path: url.pathname, status: response.status })
    }
  })
  await send('Page.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__routeLoadingDocument = Math.random().toString(36)' })
  await send('Runtime.enable')
  await send('Network.enable')
  await send('Network.setCacheDisabled', { cacheDisabled: true })
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  const navigate = async (path, condition, label, expectedPath = path) => {
    const previousDocument = await evaluate('window.__routeLoadingDocument')
    await send('Page.navigate', { url: `${origin}${path}` })
    await until(`Boolean(window.__routeLoadingDocument) && window.__routeLoadingDocument !== ${JSON.stringify(previousDocument) ?? 'undefined'}`, `novo documento: ${label}`)
    await until(condition, label)
    await until(`location.pathname + location.search + location.hash === ${JSON.stringify(expectedPath)}`, `${label}: endereço esperado`)
    assert.equal(await evaluate(routeError), false, `${label}: sem erro de import.`)
  }
  const reload = async (condition, label) => {
    const previousDocument = await evaluate('window.__routeLoadingDocument')
    await send('Page.reload', { ignoreCache: true })
    await until(`Boolean(window.__routeLoadingDocument) && window.__routeLoadingDocument !== ${JSON.stringify(previousDocument)}`, `novo documento: ${label}`)
    await until(condition, label)
  }

  let mark = network.length
  await navigate('/', landing, 'landing inicial')
  // This harness intentionally serves an empty catalog; the landing page's
  // completed empty state is degraded rather than the populated success state.
  await until('document.querySelector(".public-catalog-note")?.dataset.state === "degraded"', 'catálogo vazio estabilizou')
  assert.equal(await evaluate('document.querySelector(".public-catalog-note").textContent.trim()'), 'Consulte os serviços e valores disponíveis ao agendar.', 'Catálogo vazio deve concluir sem erro de rede.')
  await sleep(250)
  assertNotRequested(Object.keys(chunks), mark, 'landing inicial')
  checks.push('Landing: nenhum chunk de acesso, cliente, equipe, gestão ou styleguide na carga inicial.')

  mark = network.length
  await click('.public-nav-cta')
  await until(login, 'CTA abriu login')
  assert.equal(await evaluate('location.pathname'), '/painel')
  assertRequested('public', mark, 'CTA')
  assertNotRequested(['staff', 'client', 'owner', 'barber', 'styleguide'], mark, 'CTA')
  await evaluate('history.back()')
  await until(`${landing} && location.pathname === '/'`, 'voltar para landing')
  await evaluate('history.forward()')
  await until(`${login} && location.pathname === '/painel'`, 'avançar para login')
  checks.push('CTA carrega acesso sob demanda; voltar/avançar preservam a rota sem baixar painéis.')

  for (const path of ['/login', '/entrar', '/cadastro', '/painel', '/agendar', '/perfil', '/meus-agendamentos', '/barbeiro', '/gestao', '/equipe', '/equipe/login', '/equipe/barbeiro', '/equipe/gestao']) {
    mark = network.length
    const expectedPath = path.startsWith('/equipe') ? '/equipe/login' : path
    await navigate(path, login, `acesso direto ${path}`, expectedPath)
    assertRequested(path.startsWith('/equipe') ? 'staff' : 'public', mark, path)
    assertNotRequested(['owner', 'barber', 'styleguide'], mark, path)
    if (['/perfil', '/meus-agendamentos'].includes(path)) assertRequested('client', mark, path)
    else assertNotRequested(['client'], mark, path)
    if (path === '/equipe' || path === '/login') {
      await reload(login, `refresh ${path}`)
      assert.equal(await evaluate('location.pathname'), expectedPath)
    }
  }
  checks.push('Aliases públicos e da equipe abrem por acesso direto/refresh, respeitam o redirecionamento da equipe e não baixam os painéis para visitantes.')

  // A fresh landing document ensures earlier route imports cannot satisfy this
  // navigation from the in-memory ESM module cache.
  await navigate('/', landing, 'landing antes do styleguide')
  mark = network.length
  await spaNavigate('/styleguide')
  await until(styleguide, 'styleguide sob demanda')
  assertRequested('styleguide', mark, 'styleguide')
  assertNotRequested(['public', 'staff', 'client', 'owner', 'barber'], mark, 'styleguide')
  await navigate('/styleguide', styleguide, 'styleguide direto')
  await reload(styleguide, 'refresh styleguide')
  checks.push('Styleguide carrega sob demanda e funciona por URL direta/refresh.')

  // Keep the asset unavailable until the explicit recovery action. A preload
  // and its later native import may issue separate requests for the same URL.
  scenario = { kind: 'fail', path: chunks.public.path, used: false, label: '503-until-reload' }
  const recoveryPath = '/login?source=route-loading#preservado'
  mark = network.length
  await send('Page.navigate', { url: `${origin}${recoveryPath}` })
  await until(routeError, '503 de chunk exibe recuperação')
  await until('document.documentElement.dataset.naReady === "true"', 'erro acionável libera a abertura Android')
  assert.equal(scenario.used, true, 'O servidor deve ter falhado o chunk de acesso.')
  assertRequested('public', mark, '503 de acesso')
  assertResponse('public', mark, 503, '503 de acesso')
  assert.equal(await evaluate('location.pathname + location.search + location.hash'), recoveryPath)
  assert.equal(await evaluate('Array.from(document.querySelectorAll("button")).some(button => button.textContent.trim() === "Recarregar página")'), true)
  assert.equal(await evaluate('Array.from(document.querySelectorAll("a")).some(link => link.textContent.trim() === "Voltar ao início" && link.getAttribute("href") === "/")'), true)
  const documentsBeforeRetry = network.filter((request) => request.type === 'Document').length
  await sleep(300)
  assert.equal(network.filter((request) => request.type === 'Document').length, documentsBeforeRetry, 'Erro não deve provocar reload automático.')
  await evaluate('document.cookie = "route_loading_sentinel=preserved; path=/; SameSite=Lax"')
  await evaluate('Array.from(document.querySelectorAll("button")).find(button => button.textContent.trim() === "Recarregar página").setAttribute("data-route-test-retry", "")')
  scenario = null
  await click('[data-route-test-retry]')
  await until(login, 'reload recupera chunk com erro')
  assert.ok(network.filter((request) => request.type === 'Document').length > documentsBeforeRetry, 'Recuperação deve recarregar o documento para limpar o import rejeitado.')
  assert.equal(await evaluate('location.pathname + location.search + location.hash'), recoveryPath)
  assert.equal(await evaluate('document.cookie.includes("route_loading_sentinel=preserved")'), true, 'Reload deve preservar cookies da sessão.')
  assert.equal(await evaluate(routeError), false)
  assertResponse('public', mark, 200, 'recuperação de acesso')
  checks.push('503 controlado: erro acionável sem loop, abertura Android liberada e reload recupera preservando path/query/hash.')

  // Verify that an error does not poison a different destination in the SPA.
  scenario = { kind: 'fail', path: chunks.staff.path, used: false, label: 'error-route-reset' }
  await send('Page.navigate', { url: `${origin}/equipe` })
  await until(routeError, 'erro da equipe')
  await spaNavigate('/')
  await until(landing, 'nova rota limpa erro anterior')
  assert.equal(await evaluate(routeError), false)
  checks.push('Mudança de rota limpa a falha anterior do boundary.')

  scenario = null
  await navigate('/', landing, 'landing antes da resposta tardia')
  scenario = { kind: 'hold', path: chunks.public.path, used: false, label: 'late-response' }
  await click('.public-nav-cta')
  await untilNode(() => held.size > 0, 'chunk de acesso pendente')
  await until('Boolean(document.querySelector("main[aria-label=Carregando]"))', 'fallback acessível de carregamento')
  assert.equal(await evaluate('document.body.innerText.trim()'), '', 'Suspense deve manter a superfície vazia de texto.')
  assert.equal(await evaluate('getComputedStyle(document.querySelector("main[aria-label=Carregando]")).backgroundColor'), 'rgb(244, 244, 246)')
  assert.equal(await evaluate('document.documentElement.dataset.naReady === "true"'), false, 'Suspense não pode liberar a abertura Android.')
  await evaluate('history.back()')
  await until(`${landing} && location.pathname === '/'`, 'voltar durante carregamento')
  const delayedRequest = network.findLast((request) => request.path === chunks.public.path)
  releaseHeld()
  scenario = null
  await untilNode(() => finishedRequests.has(delayedRequest.id), 'resposta tardia terminou')
  await sleep(150)
  assert.equal(await evaluate(landing), true, 'Resposta tardia não pode substituir a rota atual.')
  assert.equal(await evaluate(login), false)
  assert.equal(await evaluate('location.pathname'), '/')
  assert.equal(await evaluate('document.documentElement.dataset.naReady === "true"'), false)
  await evaluate('history.forward()')
  await until(`${login} && location.pathname === '/painel'`, 'avançar após resposta tardia')
  checks.push('Chunk pendente mantém superfície neutra e não libera Android; voltar evita render atrasado e avançar continua funcional.')

  // Use a server-side session fixture only for the loading contract; the real
  // login/authorization flows run separately against the temporary backend.
  authenticatedBarber = true
  holdDashboardData = true
  scenario = { kind: 'hold', path: chunks.barber.path, used: false, label: 'authenticated-inner-pending' }
  mark = network.length
  await send('Page.navigate', { url: `${origin}/equipe` })
  await untilNode(() => [...held].some((item) => item.pathname === chunks.barber.path), 'JS interno do barbeiro pendente')
  await until('Boolean(document.querySelector("main[aria-label=Carregando]")) && location.pathname === "/equipe/barbeiro"', 'equipe autenticada aguarda painel interno')
  assertRequested('staff', mark, 'equipe autenticada pendente')
  assertRequested('barber', mark, 'equipe autenticada pendente')
  assertNotRequested(['public', 'client', 'owner', 'styleguide'], mark, 'equipe autenticada pendente')
  assert.equal(await evaluate('document.body.innerText.trim()'), '', 'Painel interno pendente mantém superfície vazia.')
  assert.equal(await evaluate('getComputedStyle(document.querySelector("main[aria-label=Carregando]")).backgroundColor'), 'rgb(244, 244, 246)')
  assert.equal(await evaluate(nativeReady), false, 'JS interno pendente não pode liberar a abertura Android.')
  releaseHeld()
  scenario = null
  await untilNode(() => ['/api/v1/appointments', '/api/v1/barber/blocks'].every((pathname) => [...held].some((item) => item.pathname === pathname)), 'agenda e pausas pendentes após JS interno')
  await until(barberDashboard, 'painel interno montado com dados pendentes')
  assert.equal(await evaluate(nativeReady), false, 'Dados da agenda pendentes não podem liberar a abertura Android.')
  holdDashboardData = false
  releaseHeld()
  await until(nativeReady, 'painel autenticado e dados prontos liberam a abertura Android')
  assert.equal(await evaluate(barberDashboard), true)
  assert.equal(await evaluate('Boolean(document.querySelector(".barber-dashboard [role=alert]"))'), false, 'Agenda simulada deve carregar sem erro.')
  checks.push('Equipe autenticada: JS interno e dados retidos mantêm naReady=false; agenda pronta libera a abertura Android.')

  scenario = { kind: 'fail', path: chunks.barber.path, used: false, label: 'authenticated-inner-503' }
  const innerRecoveryPath = '/equipe/barbeiro?source=inner-route-loading#preservado'
  mark = network.length
  await send('Page.navigate', { url: `${origin}${innerRecoveryPath}` })
  await until(routeError, '503 interno do painel exibe recuperação')
  await until(nativeReady, 'erro interno acionável libera abertura Android')
  assert.equal(scenario.used, true)
  assertRequested('staff', mark, '503 interno')
  assertRequested('barber', mark, '503 interno')
  assertResponse('barber', mark, 503, '503 interno')
  assert.equal(await evaluate('location.pathname + location.search + location.hash'), innerRecoveryPath)
  assert.equal(await evaluate(login), false, 'Erro interno não pode descartar a sessão autenticada e mostrar login.')
  const innerDocumentCount = network.filter((request) => request.type === 'Document').length
  await sleep(300)
  assert.equal(network.filter((request) => request.type === 'Document').length, innerDocumentCount, 'Erro interno não deve causar reload automático.')
  await evaluate('Array.from(document.querySelectorAll("button")).find(button => button.textContent.trim() === "Recarregar página").setAttribute("data-route-test-retry", "")')
  scenario = null
  await click('[data-route-test-retry]')
  await until(barberDashboard, 'reload recupera painel interno com sessão restaurada')
  await until(nativeReady, 'painel interno recuperado está pronto')
  assert.ok(network.filter((request) => request.type === 'Document').length > innerDocumentCount)
  assert.equal(await evaluate('location.pathname + location.search + location.hash'), innerRecoveryPath)
  assert.equal(await evaluate(routeError), false)
  assert.equal(await evaluate(login), false)
  assertResponse('barber', mark, 200, 'recuperação interna autenticada')
  assertNotRequested(['public', 'client', 'owner', 'styleguide'], mark, 'recuperação interna autenticada')
  checks.push('503 do chunk interno: recuperação por reload mantém sessão simulada e URL completa, retorna ao painel e libera prontidão após os dados.')
  scenario = null
  authenticatedBarber = false
  for (const check of checks) console.log(`OK: ${check}`)
  console.log(`Evidências: ${artifacts}`)
} catch (error) {
  if (socket?.readyState === WebSocket.OPEN) {
    try {
      const screenshot = await send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(join(artifacts, 'failure.png'), Buffer.from(screenshot.data, 'base64'))
    } catch { /* Retain the original test failure if the browser closed. */ }
  }
  throw error
} finally {
  writeFileSync(join(artifacts, 'route-loading.json'), JSON.stringify({ chunks, initialFiles: [...initialFiles], checks, requests, network, responses }, null, 2))
  for (const { response } of held) response.destroy()
  held.clear()
  if (socket?.readyState === WebSocket.OPEN) {
    try { await send('Browser.close') } catch { /* The process may already be closing. */ }
  }
  for (const command of pending.values()) { clearTimeout(command.timer); command.reject(new Error('Teste encerrado.')) }
  pending.clear()
  socket?.close()
  chrome?.kill()
  server.closeAllConnections()
  server.close()
}
