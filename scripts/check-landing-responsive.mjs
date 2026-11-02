import { createServer } from 'node:http'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const root = fileURLToPath(new URL('../', import.meta.url))
const artifacts = mkdtempSync(join(tmpdir(), 'na-responsive-'))
const catalogFixture = [
  { id: 'qa-hair', name: 'Corte do catálogo de teste', description: 'Corte individual.', category: 'cabelo', price_cents: 4575, duration_minutes: 37, active: true },
  { id: 'qa-beard', name: 'Barba do catálogo de teste', description: 'Barba individual.', category: 'barba', price_cents: 3250, duration_minutes: 25, active: true },
  { id: 'qa-combo', name: 'Combo do catálogo de teste', description: 'Corte e barba.', category: 'combos', price_cents: 7390, duration_minutes: 62, active: true },
  { id: 'qa-inactive', name: 'Serviço inativo de teste', description: '', category: 'cabelo', price_cents: 1, duration_minutes: 1, active: false },
  { id: 'qa-unknown', name: 'Categoria desconhecida de teste', description: '', category: 'categoria-nova-nao-mapeada', price_cents: 9999, duration_minutes: 99, active: true },
]
let catalogScenario = { status: 200, body: catalogFixture }
let professionalsScenario = { status: 200, body: [
  { id: 'qa-professional-1', display_name: 'Profissional de teste com nome comprido', photo_url: null },
  { id: 'qa-professional-2', display_name: 'Segundo profissional de teste', photo_url: null },
] }
const delayedCatalogResponses = []
const catalogRequests = []
const writeJson = (response, status, body) => {
  if (response.destroyed || response.writableEnded) return
  if (!response.headersSent) response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}
const server = createServer((request, response) => {
  const pathname = request.url.split('?')[0]
  if (pathname === '/api/v1/public/barbers') {
    writeJson(response, professionalsScenario.status, professionalsScenario.body)
    return
  }
  if (pathname === '/api/v1/public/services') {
    const scenario = catalogScenario
    catalogRequests.push({ delayed: Boolean(scenario.delayed), status: scenario.status, firstItem: scenario.body[0]?.name ?? null })
    if (scenario.delayed) {
      // Send cache policy immediately. Holding the headers makes Chrome wait on
      // its cache lock instead of issuing the new request after a SPA remount.
      response.writeHead(scenario.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      response.flushHeaders()
      delayedCatalogResponses.push({ response, scenario })
    }
    else writeJson(response, scenario.status, scenario.body)
    return
  }
  if (pathname === '/api/v1/auth/session') {
    writeJson(response, 401, { code: 'UNAUTHORIZED', message: 'Sessão de teste ausente.' })
    return
  }
  let file = join(root, 'dist', decodeURIComponent(pathname))
  if (!existsSync(file) || !extname(file)) file = join(root, 'dist/index.html')
  response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream')
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
  const until = async (expression, label) => {
    for (let attempt = 0; attempt < 60; attempt++) {
      if (await evaluate(expression)) return
      await sleep(100)
    }
    console.error(JSON.stringify({ label, browser: await evaluate(`({ path: location.pathname, catalogState: document.querySelector('.public-catalog-note')?.dataset.state, catalogMessage: document.querySelector('.public-catalog-note')?.textContent })`), catalogRequests, delayed: delayedCatalogResponses.map(({ response }) => ({ destroyed: response.destroyed, ended: response.writableEnded })) }))
    throw new Error(`Tempo esgotado: ${label}`)
  }
  const untilNode = async (predicate, label) => {
    for (let attempt = 0; attempt < 60; attempt++) {
      if (predicate()) return
      await sleep(100)
    }
    throw new Error(`Tempo esgotado: ${label}`)
  }
  const key = async (value) => {
    const virtualKey = { Tab: 9, Enter: 13, Escape: 27, Space: 32 }[value]
    const keyValue = value === 'Space' ? ' ' : value
    const text = value === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : value === 'Space' ? { text: ' ', unmodifiedText: ' ' } : {}
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyValue, code: value, windowsVirtualKeyCode: virtualKey, nativeVirtualKeyCode: virtualKey, ...text })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyValue, code: value, windowsVirtualKeyCode: virtualKey, nativeVirtualKeyCode: virtualKey })
  }
  const click = async (selector) => {
    const point = await evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error('Alvo ausente: ' + ${JSON.stringify(selector)});
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      if (!element.contains(document.elementFromPoint(x, y))) throw new Error('Alvo encoberto: ' + ${JSON.stringify(selector)});
      return { x, y };
    })()`)
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 })
  }
  const waitContentImages = async (selector) => {
    const count = await evaluate(`document.querySelector(${JSON.stringify(selector)})?.querySelectorAll('.public-content-image').length ?? 0`)
    for (let index = 0; index < count; index++) {
      const container = `document.querySelector(${JSON.stringify(selector)}).querySelectorAll('.public-content-image')[${index}]`
      await evaluate(`${container}.scrollIntoView({ behavior: 'instant', block: 'center' })`)
      await until(`(() => { const image = ${container}.querySelector('img'); return Boolean(image && image.complete && image.naturalWidth > 0) })()`, `imagem carregada: ${selector}, item ${index + 1}`)
    }
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` })
  await until('Boolean(document.querySelector(".public-service-card"))', 'landing page carregada')
  await until(`document.querySelector('.public-catalog-note')?.dataset.state === 'success'`, 'catálogo inicial carregado')
  await until(`document.querySelectorAll('.public-professional-choice').length === 2`, 'profissionais operacionais disponíveis')
  assert.equal(await evaluate(`document.querySelectorAll('.public-service-choice[data-service-id]').length`), 3, 'Cada serviço válido deve ter uma escolha específica')
  assert.ok(await evaluate(`document.querySelectorAll('#duvidas .public-faq-list details').length`) >= 4, 'FAQ deve apresentar ao menos quatro perguntas verificadas')
  assert.equal(await evaluate(`document.querySelectorAll('#duvidas details[open]').length`), 0, 'Perguntas começam fechadas')
  const offscreenGallery = await evaluate(`Boolean(document.querySelector('.public-gallery') && document.querySelector('.public-gallery').getBoundingClientRect().top > innerHeight + 240)`)
  if (offscreenGallery) assert.equal(await evaluate(`document.querySelectorAll('.public-gallery img').length`), 0, 'Galeria distante da tela não deve montar downloads de imagens')
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
      const card = element.closest('.public-service-card, .public-service-item, .public-visit-info, .public-hours-list, .public-team-card, .public-faq-list details, .public-gallery-grid figure, .public-testimonial-grid figure')
      const boundary = card?.getBoundingClientRect()
      for (const rect of range.getClientRects()) {
        if (!rect.width || !rect.height) continue
        if (rect.left < -1 || rect.right > viewport + 1 || (boundary && (rect.left < boundary.left - 1 || rect.right > boundary.right + 1))) {
          issues.push({ selector: element.className || element.tagName, text: text.textContent.trim().slice(0, 60), left: Math.round(rect.left), right: Math.round(rect.right), viewport })
          break
        }
      }
    }
    for (const element of document.querySelectorAll('.public-service-card, .public-service-item, .public-visit-info, .public-visit-media, .public-hours-list, .public-team-card, .public-map-frame, .public-steps li, .public-faq-grid, .public-faq-list details, .public-gallery-grid figure, .public-testimonial-grid figure, .public-practical-info, .public-shop-photo')) {
      const rect = element.getBoundingClientRect()
      if (rect.left < -1 || rect.right > viewport + 1 || element.scrollWidth > element.clientWidth + 1) issues.push({ selector: element.className || element.tagName, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth })
    }
    return issues
  }
  for (const width of [280, 320, 360, 375, 390, 414, 480, 568, 600, 700, 701, 768, 820, 900, 901, 1024, 1099, 1100, 1101, 1280, 1440]) {
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

  // Exercise actual browser input, so outside-click focus and keyboard navigation
  // cannot pass through a synthetic React handler alone.
  const origin = `http://127.0.0.1:${server.address().port}`
  const menuExpanded = `document.querySelector('.public-menu-button').getAttribute('aria-expanded') === 'true'`
  const menuClosed = `document.querySelector('.public-menu-button').getAttribute('aria-expanded') === 'false'`
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await send('Page.navigate', { url: origin })
  await until('Boolean(document.querySelector(".public-skip-link"))', 'atalho de conteúdo disponível')
  await send('Page.bringToFront')
  await key('Tab')
  assert.equal(await evaluate(`document.activeElement.matches('.public-skip-link')`), true, 'Primeiro Tab deve alcançar o atalho de conteúdo')
  await key('Enter')
  await until(`document.activeElement.id === 'conteudo-principal'`, 'atalho move foco para o conteúdo')
  assert.equal(await evaluate('location.hash'), '#conteudo-principal')

  await evaluate(`window.scrollTo({ top: 0, behavior: 'instant' }); document.querySelector('.public-menu-button').focus()`)
  await key('Tab')
  assert.equal(await evaluate(`Boolean(document.activeElement.closest('.public-nav'))`), false, 'Menu fechado não deve receber Tab nos links invisíveis')
  await evaluate(`document.querySelector('.public-menu-button').focus()`)
  await key('Enter')
  await until(menuExpanded, 'menu aberto pelo teclado')
  await key('Escape')
  await until(menuClosed, 'Escape fecha menu com foco no botão')
  assert.equal(await evaluate(`document.activeElement.matches('.public-menu-button')`), true)
  await key('Enter')
  await until(menuExpanded, 'menu reaberto pelo teclado')
  await key('Tab')
  assert.equal(await evaluate(`Boolean(document.activeElement.closest('.public-nav'))`), true, 'Tab alcança os links do menu aberto')
  await key('Escape')
  await until(menuClosed, 'Escape fecha menu com foco em link')
  assert.equal(await evaluate(`document.activeElement.matches('.public-menu-button')`), true, 'Escape retorna foco ao botão')

  await click('.public-menu-button')
  await until(menuExpanded, 'menu aberto para testar toque fora')
  // A temporary button isolates native outside-click focus from fragment-link
  // navigation, which can legitimately focus the destination instead of the link.
  await evaluate(`(() => {
    const button = document.createElement('button');
    button.id = 'landing-test-outside-target';
    button.type = 'button';
    button.textContent = 'Alvo externo de teste';
    button.style.cssText = 'position:fixed;left:20px;bottom:20px;width:180px;min-height:44px;z-index:30';
    document.body.append(button);
  })()`)
  try {
    await click('#landing-test-outside-target')
    await until(menuClosed, 'toque fora fecha o menu')
    assert.equal(await evaluate(`document.activeElement.id === 'landing-test-outside-target'`), true, 'Toque fora preserva foco natural no botão escolhido')
  } finally {
    await evaluate(`document.querySelector('#landing-test-outside-target')?.remove()`)
  }

  await evaluate(`window.scrollTo({ top: 0, behavior: 'instant' })`)
  await click('.public-menu-button')
  await until(menuExpanded, 'menu aberto antes de escolher seção')
  await click('.public-nav a[href="#equipe"]')
  await until(menuClosed, 'escolher seção fecha o menu')
  assert.equal(await evaluate('location.hash'), '#equipe')

  await evaluate(`window.scrollTo({ top: 0, behavior: 'instant' })`)
  await click('.public-menu-button')
  await until(menuExpanded, 'menu aberto antes de redimensionar')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await until(menuClosed, 'desktop limpa o estado aberto do menu móvel')
  assert.equal(await evaluate(`document.querySelector('.public-nav').getClientRects().length > 0`), true, 'Navegação desktop permanece visível')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await until(`document.querySelector('.public-nav').getClientRects().length === 0`, 'menu permanece fechado ao retornar ao celular')

  const callsToAction = await evaluate(`Array.from(document.querySelectorAll('.public-site a[href="/painel"]'), function(link) { return link.textContent.trim() })`)
  assert.ok(callsToAction.length >= 4, 'A página deve manter as entradas de agendamento')
  assert.ok(callsToAction.every((label) => label === 'Agendar horário'), 'Todas as entradas de agendamento devem usar o mesmo nome')
  assert.equal(await evaluate(`document.querySelector('.public-art-booking').getAttribute('href')`), '#como-funciona')
  assert.match(await evaluate(`document.querySelector('.public-art-booking').textContent`), /Veja como agendar/)
  assert.equal(await evaluate(`document.querySelector('.public-nav .public-social-link').href`), 'https://www.instagram.com/nabarbeariaa/')

  for (const width of [280, 390, 1099, 1100]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true })
    await evaluate(`window.scrollTo({ top: 0, behavior: 'instant' })`)
    await click('.public-menu-button')
    await until(menuExpanded, `menu aberto em ${width}px`)
    const issues = await evaluate(`(${inspect.toString()})()`)
    console.log(JSON.stringify({ width, menu: 'open', issues }))
    if (issues.length) failures.push({ width, menu: 'open', issues })
    await key('Escape')
    await until(menuClosed, `menu fechado em ${width}px`)
  }
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  assert.equal(await evaluate(`matchMedia('(prefers-reduced-motion: reduce)').matches`), true)
  await click('.public-menu-button')
  await until(menuExpanded, 'menu utilizável com redução de movimento')
  await key('Escape')
  await until(menuClosed, 'menu fecha com redução de movimento')
  await send('Emulation.setEmulatedMedia', { features: [] })
  console.log('OK: atalho de conteúdo, teclado, Escape, toque fora, seções, resize, CTAs e redução de movimento.')

  // Native disclosure controls must remain operable by keyboard without
  // moving focus into the answer or emulating expanded state through ARIA.
  const firstQuestion = `document.querySelector('#duvidas details')`
  await evaluate(`document.querySelector('#duvidas summary').scrollIntoView({ behavior: 'instant', block: 'center' }); document.querySelector('#duvidas summary').focus()`)
  await key('Enter')
  await until(`${firstQuestion}.open`, 'Enter abre a pergunta')
  assert.equal(await evaluate(`document.activeElement.matches('#duvidas summary')`), true, 'Expandir mantém foco no summary')
  assert.equal(await evaluate(`getComputedStyle(document.activeElement).outlineStyle !== 'none' && parseFloat(getComputedStyle(document.activeElement).outlineWidth) > 0`), true, 'Summary tem foco visível')
  assert.equal(await evaluate(`${firstQuestion}.querySelector('p').getClientRects().length > 0`), true, 'Resposta expandida fica disponível')
  await key('Space')
  await until(`!${firstQuestion}.open`, 'Espaço fecha a pergunta')
  assert.equal(await evaluate(`document.activeElement.matches('#duvidas summary')`), true)
  await key('Space')
  await until(`${firstQuestion}.open`, 'Espaço abre a pergunta')
  await key('Enter')
  await until(`!${firstQuestion}.open`, 'Enter fecha a pergunta')
  assert.equal(await evaluate(`document.querySelector('#duvidas summary').hasAttribute('aria-expanded')`), false, 'Summary mantém a semântica nativa de expansão')

  for (const width of [280, 390, 768, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true })
    await evaluate(`document.querySelectorAll('#duvidas details').forEach(function(item) { item.open = true })`)
    const issues = await evaluate(`(${inspect.toString()})()`)
    console.log(JSON.stringify({ width, faq: 'open', issues }))
    if (issues.length) failures.push({ width, faq: 'open', issues })
  }
  await evaluate(`document.querySelectorAll('#duvidas details').forEach(function(item) { item.open = false })`)
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await evaluate(`document.querySelector('#duvidas summary').focus()`)
  await key('Enter')
  await until(`${firstQuestion}.open`, 'FAQ abre com redução de movimento')
  await key('Enter')
  await until(`!${firstQuestion}.open`, 'FAQ fecha com redução de movimento')
  await send('Emulation.setEmulatedMedia', { features: [] })
  await evaluate(`document.activeElement.blur(); window.scrollTo({ top: 0, behavior: 'instant' })`)
  console.log('OK: FAQ nativa por Enter/Espaço, foco, respostas abertas e redução de movimento.')

  const landingAvailable = async () => {
    assert.equal(await evaluate(`Boolean(document.querySelector('.public-hero h1'))`), true, 'Abertura permanece disponível')
    assert.equal(await evaluate(`document.querySelectorAll('.public-service-card').length`), 3, 'Três categorias continuam disponíveis')
    assert.equal(await evaluate(`Boolean(document.querySelector('.public-hero-actions a[href="/painel"]'))`), true, 'Agendamento permanece acessível')
    assert.equal(await evaluate(`Boolean(document.querySelector('#localizacao a[href^="tel:"]'))`), true, 'Telefone permanece acessível')
  }
  const assertCatalog = async () => {
    await until(`document.querySelector('.public-catalog-note')?.dataset.state === 'success'`, 'catálogo disponível')
    const items = await evaluate(`Array.from(document.querySelectorAll('.public-service-item'), function(item) {
      return { name: item.querySelector('strong')?.textContent.trim(), duration: item.querySelector(':scope > div > span')?.textContent.trim(), price: item.querySelector('.public-service-price')?.textContent.trim(), category: item.closest('.public-service-card')?.dataset.category };
    })`)
    for (const expected of catalogFixture.slice(0, 3)) {
      const item = items.find((candidate) => candidate.name === expected.name)
      assert.ok(item, `Serviço ativo ausente: ${expected.name}`)
      assert.equal(item.category, expected.category, 'Categoria da API deve ter associação explícita')
      assert.equal(item.price?.replace(/\s/g, ' '), new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(expected.price_cents / 100).replace(/\s/g, ' '), 'Preço deve usar centavos do catálogo operacional')
      assert.equal(item.duration, `${expected.duration_minutes} min`, 'Duração deve corresponder à API')
    }
    assert.equal(items.some((item) => item.name === catalogFixture[3].name), false, 'Serviço inativo não pode ser exibido')
    assert.equal(items.some((item) => item.name === catalogFixture[4].name), false, 'Categoria desconhecida não pode receber associação inventada')
  }
  const navigateToLanding = async () => {
    await send('Page.navigate', { url: origin })
    await until(`Boolean(document.querySelector('.public-service-card'))`, 'vitrine disponível')
  }
  await navigateToLanding()
  await assertCatalog()
  await landingAvailable()
  const sectionOrder = await evaluate(`Array.from(document.querySelectorAll('main section[id]'), function(section) { return section.id })`)
  assert.ok(sectionOrder.indexOf('experiencia') < sectionOrder.indexOf('equipe'), 'Serviços devem anteceder a equipe')
  assert.ok(sectionOrder.indexOf('equipe') < sectionOrder.indexOf('como-funciona'), 'Equipe deve anteceder explicação do agendamento')
  assert.ok(sectionOrder.indexOf('como-funciona') < sectionOrder.indexOf('localizacao'), 'Localização encerra a sequência de informações')
  assert.equal(await evaluate(`document.querySelectorAll('#localizacao').length`), 1, 'Localização deve ter seção única')
  assert.equal(await evaluate(`document.querySelectorAll('.public-trust-row, .public-map-section').length`), 0, 'Blocos redundantes antigos não devem permanecer')
  assert.equal(await evaluate(`document.querySelectorAll('#localizacao .public-map-frame').length`), 1, 'Mapa deve integrar a localização')
  assert.ok(sectionOrder.indexOf('duvidas') > sectionOrder.indexOf('localizacao'), 'FAQ deve aparecer após a localização')
  await waitContentImages('.public-gallery')
  await waitContentImages('.public-shop-photo')
  const optionalContent = await evaluate(`(() => {
    const errors = [];
    const gallery = document.querySelector('.public-gallery');
    if (gallery) {
      const photos = gallery.querySelectorAll('figure');
      if (!photos.length) errors.push('Galeria vazia');
      const illustrativeGallery = /imagens ilustrativas temporárias/i.test(gallery.querySelector('.public-section-heading')?.textContent || '');
      for (const photo of photos) {
        const image = photo.querySelector('img, [role="img"]');
        if (!image || !(image.getAttribute('alt') || image.getAttribute('aria-label'))?.trim() || !photo.querySelector('figcaption')?.textContent.trim()) errors.push('Foto sem identificação ou legenda');
        if (image?.tagName === 'IMG' && (image.getAttribute('loading') !== 'lazy' || !(Number(image.getAttribute('width')) > 0) || !(Number(image.getAttribute('height')) > 0))) errors.push('Foto sem dimensões ou carregamento sob demanda');
        if (illustrativeGallery && !/imagem ilustrativa/i.test(photo.querySelector('.public-content-label')?.textContent || '')) errors.push('Imagem temporária sem rótulo individual');
      }
    }
    const reviews = document.querySelector('.public-testimonials');
    if (reviews) {
      const quotations = reviews.querySelectorAll('figure');
      if (!quotations.length) errors.push('Avaliações vazias');
      let illustrativeCount = 0;
      for (const quote of quotations) {
        const source = quote.querySelector('figcaption a');
        const label = quote.querySelector('figcaption .public-content-label');
        const illustrative = Boolean(label && /fictício/i.test(label.textContent));
        if (!quote.querySelector('blockquote p')?.textContent.trim() || !quote.querySelector('figcaption strong')?.textContent.trim()) errors.push('Relato sem texto ou identificação');
        if (illustrative) {
          illustrativeCount++;
          if (!label.getClientRects().length) errors.push('Rótulo fictício não está visível');
          if (source) errors.push('Exemplo fictício não deve sugerir uma fonte de avaliação real');
        } else {
          if (!source?.href.startsWith('https://')) errors.push('Avaliação real sem fonte HTTPS');
          if (!source?.rel.includes('noopener') || !source?.rel.includes('noreferrer')) errors.push('Fonte sem isolamento de nova aba');
        }
      }
      if (illustrativeCount && (!/fictícios/i.test(reviews.querySelector('.public-section-heading')?.textContent || '') || !/não são avaliações de clientes/i.test(reviews.querySelector('.public-section-heading')?.textContent || ''))) errors.push('Seção não esclarece que os exemplos são fictícios');
    }
    const practical = document.querySelector('.public-practical-info');
    if (practical && !practical.querySelector('li, a')) errors.push('Informações práticas vazias');
    const shopPhoto = document.querySelector('.public-shop-photo');
    if (shopPhoto && !shopPhoto.querySelector('figcaption')?.textContent.trim()) errors.push('Foto da unidade sem legenda');
    const shopExampleLabel = shopPhoto?.querySelector('.public-content-label');
    if (shopExampleLabel && !/não representa a unidade/i.test(shopExampleLabel.textContent)) errors.push('Foto ilustrativa não esclarece que não representa a unidade');
    return errors;
  })()`)
  assert.deepEqual(optionalContent, [], 'Conteúdo opcional existente deve ter material e identificação')

  if (await evaluate(`Boolean(document.querySelector('.public-gallery-grid figure img'))`)) {
    const beforeImageFailure = await evaluate(`(() => {
      const figure = document.querySelector('.public-gallery-grid figure');
      figure.scrollIntoView({ behavior: 'instant', block: 'center' });
      document.querySelector('#duvidas summary').focus({ preventScroll: true });
      return { alt: figure.querySelector('img').alt, caption: figure.querySelector('figcaption').textContent, height: figure.querySelector('.public-content-image').getBoundingClientRect().height };
    })()`)
    await evaluate(`(() => { const image = document.querySelector('.public-gallery-grid figure img'); image.removeAttribute('srcset'); image.removeAttribute('sizes'); image.src = '/__landing-test-missing.png' })()`)
    await until(`Boolean(document.querySelector('.public-gallery-grid figure .public-content-image-fallback'))`, 'erro real da imagem mostra fallback')
    assert.equal(await evaluate(`document.querySelector('.public-gallery-grid figure .public-content-image-fallback').getAttribute('aria-label')`), beforeImageFailure.alt, 'Fallback preserva a identificação da imagem')
    assert.equal(await evaluate(`document.querySelector('.public-gallery-grid figure figcaption').textContent`), beforeImageFailure.caption, 'Legenda permanece quando a imagem falha')
    assert.equal(await evaluate(`document.activeElement.matches('#duvidas summary')`), true, 'Falha da imagem não rouba o foco')
    assert.ok(Math.abs((await evaluate(`document.querySelector('.public-gallery-grid figure .public-content-image').getBoundingClientRect().height`)) - beforeImageFailure.height) < 1, 'Fallback preserva o espaço reservado')
    await navigateToLanding()
    await assertCatalog()
    console.log('OK: imagens entram perto da tela; erro real preserva fallback, legenda, foco e dimensões.')
  }

  for (const [name, scenario] of [
    ['vazio', { status: 200, body: [] }],
    ['erro HTTP', { status: 500, body: { code: 'INTERNAL_ERROR', message: 'Falha simulada do catálogo.' } }],
    ['categorias não mapeadas', { status: 200, body: [catalogFixture[4]] }],
  ]) {
    catalogScenario = scenario
    await navigateToLanding()
    await until(`document.querySelector('.public-catalog-note')?.dataset.state === 'degraded'`, `catálogo degradado: ${name}`)
    await landingAvailable()
    assert.equal(await evaluate(`document.querySelectorAll('.public-service-price').length`), 0, `${name}: sem preços estáticos como substituição`)
    assert.equal(await evaluate(`document.querySelectorAll('.public-service-item').length`), 0, `${name}: sem itens fictícios`)
    console.log(`OK: catálogo ${name} mantém categorias, contato e agendamento sem valores inventados.`)
  }

  catalogScenario = { status: 200, body: catalogFixture, delayed: true }
  let delayedStart = delayedCatalogResponses.length
  await navigateToLanding()
  await untilNode(() => delayedCatalogResponses.length > delayedStart, 'requisição lenta recebida')
  await until(`document.querySelector('.public-catalog-note')?.dataset.state === 'loading'`, 'estado de carregamento do catálogo')
  await landingAvailable()
  assert.equal(await evaluate(`document.querySelectorAll('.public-service-price').length`), 0, 'Catálogo lento não deve mostrar valores provisórios')
  for (const { response, scenario } of delayedCatalogResponses.slice(delayedStart)) writeJson(response, scenario.status, scenario.body)
  await assertCatalog()
  console.log('OK: resposta lenta não bloqueia a página e atualiza os valores ao chegar.')

  const staleCatalog = catalogFixture.slice(0, 3).map((item) => ({ ...item, name: `RESPOSTA ANTIGA ${item.name}`, price_cents: 1 }))
  catalogScenario = { status: 200, body: staleCatalog, delayed: true }
  delayedStart = delayedCatalogResponses.length
  await navigateToLanding()
  await untilNode(() => delayedCatalogResponses.length > delayedStart, 'requisição pendente antes de sair')
  await click('.public-hero-actions a[href="/painel"]')
  await until(`location.pathname === '/painel' && !document.querySelector('.public-site')`, 'CTA navega durante consulta pendente')
  catalogScenario = { status: 200, body: catalogFixture }
  await evaluate('history.back()')
  await until(`Boolean(document.querySelector('.public-site'))`, 'retorno à landing')
  await assertCatalog()
  for (const { response, scenario } of delayedCatalogResponses.slice(delayedStart)) writeJson(response, scenario.status, scenario.body)
  await sleep(250)
  await assertCatalog()
  assert.equal(await evaluate(`document.querySelector('#experiencia').textContent.includes('RESPOSTA ANTIGA')`), false, 'Resposta após desmontagem não pode contaminar a nova vitrine')
  console.log('OK: navegar com consulta pendente e voltar mantém o catálogo atual, sem aplicar resposta antiga.')

  const initialProfessionalsScenario = professionalsScenario
  for (const scenario of [{ status: 200, body: [] }, { status: 503, body: { code: 'UNAVAILABLE', message: 'Indisponível para teste.' } }]) {
    professionalsScenario = scenario
    await navigateToLanding()
    await until(`document.querySelector('#equipe').textContent.includes('A escolha de profissional está disponível na agenda.')`, 'profissionais vazios ou indisponíveis têm orientação')
    assert.equal(await evaluate(`document.querySelectorAll('.public-professional-choice').length`), 0, 'Cartões editoriais não podem simular IDs operacionais')
    assert.ok(await evaluate(`document.querySelectorAll('.public-team-card').length`) > 0, 'Apresentação editorial continua disponível')
  }
  professionalsScenario = initialProfessionalsScenario
  await navigateToLanding()
  await assertCatalog()
  await until(`document.querySelectorAll('.public-professional-choice').length === 2`, 'escolha profissional recuperada')
  console.log('OK: equipe vazia ou indisponível mantém apresentação editorial sem escolhas falsas; recuperação usa IDs operacionais.')

  await evaluate('document.fonts.ready')
  assert.equal(await evaluate(`Array.from(document.fonts).some(function(font) { return font.family.includes('Plus Jakarta Sans Variable') && font.status === 'loaded' })`), true, 'Tipografia dos títulos deve usar a fonte local carregada')
  assert.equal(await evaluate(`Array.from(performance.getEntriesByType('resource')).some(function(resource) { return resource.name.includes('fonts.googleapis.com') || resource.name.includes('fonts.gstatic.com') })`), false, 'Landing não deve solicitar fontes ao Google')
  const imageContract = await evaluate(`Array.from(document.querySelectorAll('.public-site img'), function(image) {
    return { src: image.getAttribute('src'), srcSet: image.getAttribute('srcset'), sizes: image.getAttribute('sizes'), current: image.currentSrc };
  })`)
  for (const image of imageContract) {
    assert.ok(image.src.includes('/brand/optimized/'), 'Fotos públicas devem usar os derivados locais')
    assert.ok(image.srcSet?.includes('w') && image.sizes?.length, 'Imagens devem informar variantes e tamanho de exibição')
    if (image.current) assert.ok(image.current.includes('/brand/optimized/') && image.current.endsWith('.webp'), 'Navegador deve selecionar o WebP otimizado')
  }
  assert.equal(await evaluate(`document.querySelector('.public-hero-emblem img').getAttribute('loading') === 'lazy'`), false, 'Imagem da abertura não pode ser adiada')
  assert.equal(await evaluate(`document.querySelector('.public-hero-emblem img').getAttribute('fetchpriority')`), 'high')
  console.log('OK: fontes locais, imagens responsivas otimizadas e prioridade da abertura.')

  for (const width of [280, 320, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true })
    const screenshotSelectors = ['.public-hero', '#experiencia', '#equipe', '.public-team-grid', '#como-funciona', '#localizacao', '#duvidas']
    for (const optionalSelector of ['.public-gallery', '.public-testimonials', '.public-shop-photo', '.public-practical-info']) {
      if (await evaluate(`Boolean(document.querySelector(${JSON.stringify(optionalSelector)}))`)) screenshotSelectors.push(optionalSelector)
    }
    for (const selector of screenshotSelectors) {
      assert.equal(await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`), true, `Seção esperada ausente: ${selector}`)
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({behavior:'instant', block:'start'})`)
      await waitContentImages(selector)
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
  for (const { response } of delayedCatalogResponses) response.destroy()
  socket?.close()
  chrome?.kill()
  server.close()
}
