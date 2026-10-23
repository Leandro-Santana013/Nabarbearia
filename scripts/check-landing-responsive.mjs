import { createServer } from 'node:http'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const root = fileURLToPath(new URL('../', import.meta.url))
const artifacts = mkdtempSync(join(tmpdir(), 'na-responsive-'))
const server = createServer((request, response) => {
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
    const id = ++sequence
    pending.set(id, (message) => message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result))
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` })
  for (let i = 0; i < 60; i++) { if (await evaluate('Boolean(document.querySelector(".public-feature-card"))')) break; await sleep(100) }
  await evaluate('document.fonts.ready.then(() => true)')
  await sleep(1000)
  const failures = []
  const inspect = () => {
    const issues = []
    const viewport = document.documentElement.clientWidth
    const walker = document.createTreeWalker(document.querySelector('.public-site'), NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const text = walker.currentNode
      if (!text.textContent.trim()) continue
      const element = text.parentElement
      const range = document.createRange()
      range.selectNodeContents(text)
      const card = element.closest('.public-feature-card, .location-card, .public-team-card, .public-brand-banner-copy')
      const boundary = card?.getBoundingClientRect()
      for (const rect of range.getClientRects()) {
        if (!rect.width || !rect.height) continue
        if (rect.left < -1 || rect.right > viewport + 1 || (boundary && (rect.left < boundary.left - 1 || rect.right > boundary.right + 1))) {
          issues.push({ selector: element.className || element.tagName, text: text.textContent.trim().slice(0, 60), left: Math.round(rect.left), right: Math.round(rect.right), viewport })
          break
        }
      }
    }
    for (const element of document.querySelectorAll('.public-feature-card, .location-card, .public-team-card, .public-map-frame, .public-steps li')) {
      const rect = element.getBoundingClientRect()
      if (rect.left < -1 || rect.right > viewport + 1 || element.scrollWidth > element.clientWidth + 1) issues.push({ selector: element.className || element.tagName, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth })
    }
    return issues
  }
  for (const width of [280, 320, 360, 375, 390, 414, 480, 568, 600, 700, 701, 768, 820, 900, 901, 1024, 1100, 1280, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true })
    await sleep(60)
    const issues = await evaluate(`(${inspect.toString()})()`)
    console.log(JSON.stringify({ width, issues }))
    if (issues.length) failures.push({ width, issues })
  }
  for (const width of [320, 390, 768]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true })
    await evaluate(`document.documentElement.style.setProperty('text-size-adjust', '150%'); document.documentElement.style.setProperty('-webkit-text-size-adjust', '150%')`)
    const issues = await evaluate(`(${inspect.toString()})()`)
    console.log(JSON.stringify({ width, textScale: '150%', issues }))
    if (issues.length) failures.push({ width, textScale: '150%', issues })
    await evaluate(`document.documentElement.style.removeProperty('text-size-adjust'); document.documentElement.style.removeProperty('-webkit-text-size-adjust')`)
  }
  for (const width of [280, 320, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true })
    for (const selector of ['.public-hero', '#experiencia', '#como-funciona', '#localizacao', '.public-team-grid', '.public-map-section']) {
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({behavior:'instant', block:'start'})`)
      await sleep(100)
      const screenshot = await send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(join(artifacts, `${width}-${selector.replace(/[^a-z-]/g, '')}.png`), Buffer.from(screenshot.data, 'base64'))
    }
  }
  console.log(`Screenshots: ${artifacts}`)
  await send('Browser.close')
  assert.equal(failures.length, 0, `${failures.length} viewport(s) with overflowing content`)
} finally {
  socket?.close()
  chrome?.kill()
  server.close()
}
