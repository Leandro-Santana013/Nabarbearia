import { createServer } from 'node:http'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const root = fileURLToPath(new URL('../', import.meta.url))
const artifacts = mkdtempSync(join(tmpdir(), 'na-barber-responsive-'))
const server = createServer((request, response) => {
  if (request.url.startsWith('/api/')) {
    response.setHeader('Content-Type', 'application/json')
    const body = request.url.includes('/auth/session')
      ? { user: { id: 'preview-barber', display_name: request.headers.referer?.includes('/gestao/') ? 'Dono NA Barbearia' : 'Nailton', email: 'preview@example.test', roles: ['owner', 'barber'] }, csrf_token: 'preview' }
      : request.url.includes('/admin/summary') ? { team: [], rules: [], payments: [], payouts: [], revenue_cents: 0, total_count: 0, completed_count: 0, no_show_count: 0, commission_cents: 0, commission_pending_count: 0, outstanding_cents: 0, retained_cents: 0 }
      : []
    response.end(JSON.stringify(body))
    return
  }
  let file = join(root, 'dist', decodeURIComponent(request.url.split('?')[0]))
  if (!existsSync(file) || !extname(file)) file = join(root, 'dist/index.html')
  response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png' })[extname(file)] || 'application/octet-stream')
  response.end(readFileSync(file))
})
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let socket
let chrome
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  chrome = spawn(process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless', '--no-first-run', '--hide-scrollbars', '--remote-debugging-port=0', `--user-data-dir=${artifacts}`, 'about:blank',
  ], { stdio: 'ignore' })
  const portFile = join(artifacts, 'DevToolsActivePort')
  for (let i = 0; i < 80 && !existsSync(portFile); i++) await sleep(100)
  const port = readFileSync(portFile, 'utf8').split('\n')[0]
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  socket = new WebSocket(targets.find((item) => item.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let sequence = 0
  const pending = new Map()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id) }
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('CDP timeout: ' + method)), 15000)
    const id = ++sequence
    pending.set(id, (message) => { clearTimeout(timeout); message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result) })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  const failures = []
  const inspect = () => {
    const issues = []
    const viewport = Math.min(innerWidth, visualViewport?.width ?? innerWidth) + (visualViewport?.offsetLeft ?? 0)
    const main = document.querySelector('.barber-agenda-header').closest('main')
    for (const element of [main, ...main.querySelectorAll('*')]) {
      const rect = element.getBoundingClientRect()
      if (rect.left < -1 || rect.right > viewport + 1 || element.scrollWidth > element.clientWidth + 1) issues.push({ element: element.tagName, left: rect.left, right: rect.right, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth })
    }
    const nav = document.querySelector('nav[aria-label="Navegação do barbeiro"]').getBoundingClientRect()
    const bottom = (visualViewport?.offsetTop ?? 0) + (visualViewport?.height ?? innerHeight)
    if (nav.right > viewport + 1 || nav.bottom > bottom + 1 || nav.top < (visualViewport?.offsetTop ?? 0)) issues.push({ element: 'barber-navigation', right: nav.right, bottom: nav.bottom, visibleRight: viewport, visibleBottom: bottom })
    return { issues, days: document.querySelectorAll('.barber-agenda-day').length, selected: document.querySelectorAll('.barber-agenda-day[aria-pressed="true"]').length, columns: getComputedStyle(document.querySelector('.barber-day-actions')).gridTemplateColumns }
  }
  for (const route of ['/barbeiro', '/gestao/minha-agenda']) {
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 852, deviceScaleFactor: 1, mobile: true })
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}${route}` })
    for (let i = 0; i < 80; i++) {
      if (await evaluate('Boolean(document.querySelector(".barber-agenda-header"))')) break
      await sleep(100)
    }
    await evaluate('document.fonts.ready.then(() => true)')
    for (const [width, scale] of [[320,1], [360,1], [393,1], [430,1], [320,1.25], [393,1.25], [393,1.5], [393,2], [768,1], [1024,1], [1440,1]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 852, deviceScaleFactor: 1, mobile: width < 768 })
      await send('Emulation.setPageScaleFactor', { pageScaleFactor: scale })
      await sleep(100)
      const result = await evaluate(`(${inspect.toString()})()`)
      console.log(JSON.stringify({route, width, scale, ...result}))
      if (result.issues.length || result.days !== 7 || result.selected !== 1) failures.push({route, width, scale, ...result})
      if ([320, 393, 1440].includes(width)) {
        const screenshot = await send('Page.captureScreenshot', {format:'png'})
        writeFileSync(join(artifacts, `${route.includes('gestao') ? 'owner' : 'barber'}-${width}-${scale}.png`), Buffer.from(screenshot.data, 'base64'))
      }
      if (width === 393 && [1.25, 2].includes(scale)) {
        for (const [index, heading] of [[0, 'Novo atendimento presencial'], [1, 'Bloquear 60 minutos'], [2, 'Bloquear 15 minutos']]) {
          await evaluate(`document.querySelectorAll('.barber-day-action')[${index}].click()`)
          await sleep(100)
          assert.equal(await evaluate(`document.querySelector('.barber-day-tools h2').textContent`), heading)
          assert.equal(await evaluate(`document.querySelectorAll('.barber-day-action')[${index}].getAttribute('aria-expanded')`), 'true')
          const formResult = await evaluate(`(${inspect.toString()})()`)
          if (formResult.issues.length) failures.push({ route, width, scale, form: heading, ...formResult })
          await evaluate(`Array.from(document.querySelectorAll('.barber-day-tools button')).find(e => e.textContent === 'Fechar').click()`)
        }
      }
    }
    await evaluate(`document.querySelector('[aria-label="Ver próximos sete dias"]').click()`)
    await sleep(100)
    assert.equal(await evaluate(`document.querySelector('[aria-label="Ver próximos sete dias"]').disabled`), true)
    assert.equal(await evaluate(`document.querySelector('[aria-label="Ver sete dias anteriores"]').disabled`), false)
    const dates = await evaluate(`Array.from(document.querySelectorAll('.barber-agenda-day')).map(e => e.getAttribute('aria-label'))`)
    assert.equal(new Set(dates).size, 7)
    await evaluate(`document.querySelectorAll('.barber-agenda-day')[6].click()`)
    await sleep(100)
    assert.equal(await evaluate(`document.querySelector('.barber-agenda-day[aria-pressed="true"]').getAttribute('aria-label')`), dates[6])
    await evaluate(`document.querySelector('.barber-agenda-today').click()`)
    await sleep(100)
    assert.equal(await evaluate(`document.querySelector('.barber-agenda-day[aria-pressed="true"]').getAttribute('aria-current')`), 'date')
    console.log(`${route}: date navigation and all action forms passed`)
  }
  console.log(`Screenshots: ${artifacts}`)
  await send('Browser.close')
  assert.equal(failures.length, 0, `${failures.length} layout failures`)
} finally {
  socket?.close()
  chrome?.kill()
  server.close()
}
