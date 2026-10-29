import { spawn } from 'node:child_process'
import { stopTestProcesses } from './stop-test-processes.mjs'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const temp = mkdtempSync(join(tmpdir(), 'na-client-flow-'))
const origin = 'http://127.0.0.1:3011'
const token = randomBytes(32).toString('base64url')
const password = randomBytes(24).toString('base64url')
const processes = []
let socket
let evaluate
const logs = []
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(fn, label, timeout = 45000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try { const result = await fn(); if (result) return result } catch {}
    await sleep(200)
  }
  throw new Error(`Tempo esgotado: ${label}`)
}
async function request(path, data, auth, extra = {}) {
  const response = await fetch(`${origin}/api/v1${path}`, {
    method: data ? 'POST' : 'GET',
    headers: { Origin: origin, 'Content-Type': 'application/json', ...(auth ? { Cookie: auth.cookie, 'X-CSRF-Token': auth.csrf } : {}), ...extra },
    body: data ? JSON.stringify(data) : undefined,
  })
  const body = await response.json()
  assert(response.ok, `${path}: ${response.status} ${body.message ?? ''}`)
  return { body, cookie: response.headers.get('set-cookie')?.split(';')[0] }
}
function launch(command, args, env = {}) {
  const child = spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  child.on('error', (error) => logs.push(error.message))
  child.stderr.on('data', (data) => logs.push(data.toString()))
  processes.push(child)
  return child
}
try {
  launch(process.env.NABARBEARIA_TEST_BACKEND ?? 'cargo', process.env.NABARBEARIA_TEST_BACKEND ? [] : ['run', '--manifest-path', 'backend/Cargo.toml'], {
    NABARBEARIA_BIND: '127.0.0.1:3011', NABARBEARIA_DB_PATH: join(temp, 'test.db'),
    NABARBEARIA_FRONTEND_DIR: join(root, 'dist'), NABARBEARIA_BOOTSTRAP_TOKEN: token,
    NABARBEARIA_ALLOWED_ORIGINS: origin, NABARBEARIA_SECURE_COOKIES: 'false',
  })
  await until(async () => (await fetch(`${origin}/api/v1/health`)).ok, 'API isolada', 120000)
  const setup = await request('/setup/owner', { business_name: 'NA Teste', timezone: 'America/Sao_Paulo', email: 'owner@client-flow.test', password, display_name: 'Proprietário Teste' }, null, { 'X-Bootstrap-Token': token })
  const owner = { cookie: setup.cookie, csrf: setup.body.csrf_token }
  const service = (await request('/admin/services', { name: '(COMBO 2) Corte + Barba', description: 'Corte de cabelo + barba com toalha quente.', category: 'COMBOS', price_cents: 9000, duration_minutes: 60, active: true }, owner)).body
  const barber = (await request('/admin/barbers', { display_name: 'Sorriso', email: 'barber@client-flow.test', password }, owner)).body
  for (let weekday = 1; weekday <= 6; weekday++) await request('/admin/schedules', { barber_user_id: barber.id, weekday, start_minute: 600, end_minute: 1200 }, owner)
  await request('/auth/register', { email: 'client@client-flow.test', password, display_name: 'Cliente Integração' })

  launch(process.env.CHROME_BIN ?? 'google-chrome', ['--headless', '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--remote-debugging-port=9224', `--user-data-dir=${join(temp, 'chrome')}`, 'about:blank'])
  const target = await until(async () => (await (await fetch('http://127.0.0.1:9224/json/list')).json()).find((item) => item.type === 'page'), 'Chrome')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  let sequence = 0
  const pending = new Map()
  const runtimeErrors = []
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params.exceptionDetails.text)
    if (message.id && pending.has(message.id)) { const { resolve, reject, timer } = pending.get(message.id); clearTimeout(timer); pending.delete(message.id); message.error ? reject(new Error(message.error.message)) : resolve(message.result) }
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP: ${method}`)) }, 20000)
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }))
  })
  evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
    return result.result?.value
  }
  const text = async () => (await evaluate('document.body.innerText')).replace(/\u00a0/g, ' ')
  const waitText = (value) => until(async () => (await text()).includes(value), value)
  const click = async (label) => {
    await until(() => evaluate(`Boolean([...document.querySelectorAll('button, [role=menuitem]')].find(b => !b.disabled && b.textContent.trim() === ${JSON.stringify(label)}))`), `botão ${label}`)
    await evaluate(`[...document.querySelectorAll('button, [role=menuitem]')].find(b => !b.disabled && b.textContent.trim() === ${JSON.stringify(label)}).click()`)
  }
  const clickSelector = async (selector) => { await until(() => evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`), selector); await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`) }
  const navigate = async (path) => { await send('Page.navigate', { url: `${origin}${path}` }) }
  const appointments = () => evaluate("fetch('/api/v1/appointments').then(r=>r.json())")
  const fill = (selector, value) => evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`)
  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await navigate('/painel')
  await waitText('Bem-vindo de volta!')
  await fill('input[name="email"]', 'client@client-flow.test'); await fill('input[name="password"]', 'incorrect-password')
  await click('Entrar'); await waitText('E-mail ou senha incorretos.')
  assert.equal(await evaluate('document.querySelector(\'input[name="email"]\').value'), 'client@client-flow.test')
  await fill('input[name="email"]', 'client@client-flow.test'); await fill('input[name="password"]', password)
  await click('Entrar')
  await waitText('Olá, Cliente Integração')
  assert.equal(await evaluate('location.pathname'), '/home')
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true)
  writeFileSync(join(temp, 'home.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  console.log('OK: login pelo painel leva à nova Home e mantém catálogo da API.')

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const day = new Date(`${today}T12:00:00Z`)
  do { day.setUTCDate(day.getUTCDate() + 1) } while (day.getUTCDay() === 0)
  const dateLabel = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeZone: 'UTC' }).format(day)
  async function bookFromDetail() {
    await click('Escolher Horário')
    await waitText('Escolher Data e Horário')
    await clickSelector(`button[aria-label=${JSON.stringify(dateLabel)}]`)
    const selector = '[role="group"][aria-labelledby$="-time-heading"] button:not(:disabled)'
    await clickSelector(selector)
    await click('Revisar Agendamento')
    await waitText('Resumo do agendamento')
    await click('Confirmar Agendamento')
    await waitText('Agendamento Confirmado!')
  }
  await clickSelector('button[aria-label="Selecionar (COMBO 2) Corte + Barba"]')
  await waitText('Selecionar Profissional')
  await evaluate("[...document.querySelectorAll('label')].find(label=>label.textContent.trim()==='Sorriso').click()")
  await bookFromDetail()
  let list = await appointments()
  assert.equal(list.length, 1)
  const first = list[0]
  assert.equal(first.service_id, service.id); assert.equal(first.barber_user_id, barber.id); assert.equal(first.price_cents, 9000); assert.equal(first.duration_minutes, 60)
  await send('Page.reload'); await waitText('Agendamento Confirmado!')
  console.log('OK: reserva persistida no servidor e comprovante recuperado após recarregar.')

  await click('Ver Meus Agendamentos'); await waitText('Meus Agendamentos')
  await click('Remarcar'); await waitText('Escolher Data e Horário')
  await clickSelector('[role="group"][aria-labelledby$="-time-heading"] button:not(:disabled)')
  await click('Revisar Agendamento'); await click('Confirmar Agendamento'); await waitText('Agendamento Confirmado!')
  list = await appointments(); assert.equal(list.length, 1); assert.equal(list[0].id, first.id); assert.notEqual(list[0].starts_at, first.starts_at)
  console.log('OK: remarcação altera o mesmo agendamento.')

  await navigate('/perfil'); await waitText('Meu Perfil'); await click('Sair da Conta')
  await navigate('/equipe'); await waitText('Acesso da equipe')
  await fill('input[name="email"]', 'barber@client-flow.test'); await fill('input[name="password"]', password)
  await click('Entrar'); await waitText('Olá, Sorriso!')
  const bookedDateLabel = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeZone: 'America/Sao_Paulo' }).format(new Date(list[0].starts_at))
  await clickSelector(`button[aria-label=${JSON.stringify(bookedDateLabel)}]`)
  await waitText('Cliente Integração')
  await click('Iniciar Atendimento'); await waitText('Em Atendimento')
  await click('Concluir Serviço'); await waitText('Serviço concluído com sucesso.')
  assert.equal((await appointments()).find(item => item.id === first.id).status, 'completed')
  await click('Perfil'); await click('Sair da conta')
  await navigate('/login'); await waitText('Bem-vindo de volta!')
  await fill('input[name="email"]', 'client@client-flow.test'); await fill('input[name="password"]', password)
  await click('Entrar'); await waitText('Olá, Cliente Integração')
  console.log('OK: reserva do cliente recebida, iniciada e concluída pelo barbeiro na interface.')
  await navigate('/meus-agendamentos'); await waitText('Meus Agendamentos'); await click('Histórico')
  await clickSelector('button[aria-label="Avaliar com 5 estrelas"]')
  await waitText('Avaliação salva.')
  assert.equal((await appointments())[0].rating, 5)
  await send('Page.reload'); await waitText('Meus Agendamentos'); await click('Histórico')
  await until(() => evaluate('document.querySelector(\'button[aria-label="Avaliar com 5 estrelas"]\')?.disabled === true'), 'avaliação persistida')
  console.log('OK: avaliação gravada e preservada após recarregar.')

  await click('Agendar Novamente'); await waitText('Selecionar Profissional'); await bookFromDetail()
  await click('Ver Meus Agendamentos'); await waitText('Meus Agendamentos'); await click('Cancelar'); await click('Confirmar cancelamento')
  await waitText('Agendamento cancelado.')
  list = await appointments(); assert.equal(list.length, 2); assert.equal(list.filter(item=>item.status === 'cancelled').length, 1)
  await send('Page.reload'); await waitText('Você não possui agendamentos futuros')
  console.log('OK: reagendamento e cancelamento persistidos.')

  await navigate('/home'); await waitText('Olá, Cliente Integração')
  await clickSelector('button[aria-label="Abrir menu da conta de Cliente Integração"]')
  await click('Sair da Conta'); await waitText('Bem-vindo de volta!')
  assert.equal(await evaluate("fetch('/api/v1/auth/session').then(r=>r.status)"), 401)
  await navigate('/meus-agendamentos'); await waitText('Bem-vindo de volta!')
  assert.equal((await text()).includes('Cortes Concluídos'), false)
  // Professional dashboard: all mutations run against the same isolated database.
  console.log('Validando acesso profissional…')
  await navigate('/barbeiro'); await waitText('Bem-vindo de volta!')
  await fill('input[name="email"]', 'barber@client-flow.test'); await fill('input[name="password"]', password)
  await click('Entrar'); await waitText('Olá, Sorriso!')
  const selectProfessionalDate = () => clickSelector(`button[aria-label=${JSON.stringify(dateLabel)}]`)
  await selectProfessionalDate(); await waitText('Agenda do Dia')
  const formField = async (label, value, select = false) => evaluate(`(() => {
    const label = [...document.querySelectorAll('label')].find(el => el.firstChild?.textContent.trim() === ${JSON.stringify(label)});
    const input = label.querySelector(${JSON.stringify(select ? 'select' : 'input')});
    Object.getOwnPropertyDescriptor(${select ? 'HTMLSelectElement' : 'HTMLInputElement'}.prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event(${JSON.stringify(select ? 'change' : 'input')}, { bubbles: true }));
  })()`)
  async function walkIn(name, time) {
    await click('Novo encaixe'); await waitText('Novo atendimento presencial')
    await formField('Nome do cliente', name)
    await formField('WhatsApp (opcional)', '13999998888')
    await formField('Serviço', service.id, true)
    await formField('Pagamento previsto', 'Pix', true)
    await formField('Observação (opcional)', 'Prefere degradê navalhado')
    await formField('Horário de início · Brasília', time)
    await click('Adicionar à agenda'); await waitText('Cliente presencial incluído na agenda.')
    await waitText(name)
  }
  await walkIn('Presencial Teste', '10:00')
  let professionalList = await appointments()
  const walkin = professionalList.find(item => item.client_display_name === 'Presencial Teste')
  assert(walkin); assert.equal(walkin.payment_method, 'Pix'); assert.equal(walkin.client_phone, '13999998888')
  assert.equal(walkin.client_note, 'Prefere degradê navalhado')
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true)
  assert.equal(await evaluate('Boolean(document.querySelector(\'a[href^="https://wa.me/5513999998888"]\'))'), true)
  await request('/admin/commission-rules', { barber_user_id: barber.id, service_id: service.id, rule_type: 'percent', amount: 5000 }, owner)
  await click('Editar contato, pagamento e observações')
  await formField('Observações', 'Navalhado leve')
  await click('Salvar detalhes'); await waitText('Detalhes atualizados.')
  assert.equal((await appointments()).find(item => item.id === walkin.id).client_note, 'Navalhado leve')
  await click('Iniciar Atendimento'); await waitText('Em Atendimento')
  assert.equal(await evaluate("document.querySelector('section[aria-labelledby] > [data-slot=card]')?.textContent.includes('Em Atendimento')"), true)
  const activeLayout = await evaluate(`(() => {
    const hero = document.querySelector('section[aria-labelledby] > [data-slot=card]');
    const dates = document.querySelector('[aria-label="Consultar data"]');
    const action = [...hero.querySelectorAll('button')].find(button => button.textContent.includes('Concluir Serviço'));
    return { heroTop: hero.getBoundingClientRect().top, datesBottom: dates.getBoundingClientRect().bottom, actionBottom: action.getBoundingClientRect().bottom, navigationTop: document.querySelector('[aria-label="Navegação do barbeiro"]').getBoundingClientRect().top };
  })()`)
  assert(activeLayout.heroTop >= 0 && activeLayout.datesBottom <= activeLayout.heroTop && activeLayout.actionBottom <= activeLayout.navigationTop, JSON.stringify(activeLayout))
  writeFileSync(join(temp, 'barber-active.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  await send('Page.reload'); await waitText('Olá, Sorriso!'); await selectProfessionalDate(); await waitText('Em Atendimento')
  await click('Concluir Serviço'); await waitText('Serviço concluído com sucesso.')
  assert.equal((await appointments()).find(item => item.id === walkin.id).status, 'completed')
  assert.equal((await appointments()).find(item => item.id === walkin.id).commission_cents, 4500)
  assert(!(await text()).includes('Sua comissão'))
  assert(!(await text()).includes('sem regra de comissão'))
  await click('Meus Ganhos'); await waitText('Meus Ganhos & Métricas'); await waitText('R$ 90,00')
  assert.equal(await evaluate(`document.querySelector('[aria-label="Consultar data"]') === null`), true)
  await click('Perfil'); await waitText('Meu Perfil'); await waitText('barber@client-flow.test')
  await click('Agenda'); await waitText('Agenda do Dia')
  assert(!(await text()).includes('Sua comissão'))
  assert(!(await text()).includes('sem regra de comissão'))
  assert.equal(await evaluate(`[...document.querySelectorAll('details')].find(el => el.querySelector('summary').textContent.includes('Atendimentos Concluídos'))?.open`), false)
  await evaluate(`[...document.querySelectorAll('summary')].find(el => el.textContent.includes('Atendimentos Concluídos')).click()`)
  await waitText('Obs: Navalhado leve')
  await evaluate(`[...document.querySelectorAll('summary')].find(el => el.textContent.includes('Atendimentos Concluídos')).click()`)
  await walkIn('Falta Teste', '11:00'); await click('Falta'); await click('Registrar falta'); await waitText('Falta registrada.')
  assert.equal((await appointments()).find(item => item.client_display_name === 'Falta Teste').status, 'no_show')
  await click('Almoço 1h'); await formField('Horário de início · Brasília', '12:00'); await click('Confirmar pausa')
  await waitText('Pausa bloqueada na agenda.'); await waitText('Almoço · 12:00–13:00')
  const selectedDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(day)
  const slots = (await request(`/public/availability?${new URLSearchParams({ date: selectedDate, service_id: service.id, barber_id: barber.id })}`)).body
  assert(!slots.some(slot => slot.starts_at === `${selectedDate}T15:00:00Z`))
  await send('Page.reload'); await waitText('Olá, Sorriso!'); await selectProfessionalDate(); await waitText('Almoço · 12:00–13:00')
  const beforeConflict = (await appointments()).length
  await click('Novo encaixe'); await waitText('Novo atendimento presencial')
  await formField('Nome do cliente', 'Recuperação Teste')
  await formField('WhatsApp (opcional)', '13999998888')
  await formField('Serviço', service.id, true)
  await formField('Pagamento previsto', 'Pix', true)
  await formField('Observação (opcional)', 'Manter os detalhes após conflito')
  await formField('Horário de início · Brasília', '12:00')
  await click('Adicionar à agenda')
  await waitText('Este horário está indisponível ou bloqueado. Escolha outro horário.')
  assert(!(await text()).includes('Requested slot'))
  assert.equal((await appointments()).length, beforeConflict)
  await evaluate('document.querySelector(\'[role="alert"]\').scrollIntoView({ block: "center", behavior: "instant" })')
  writeFileSync(join(temp, 'barber-conflict.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  await formField('Horário de início · Brasília', '13:00')
  await click('Adicionar à agenda'); await waitText('Cliente presencial incluído na agenda.')
  const recovered = (await appointments()).find(item => item.client_display_name === 'Recuperação Teste')
  assert(recovered); assert.equal(recovered.client_phone, '13999998888')
  assert.equal(recovered.payment_method, 'Pix'); assert.equal(recovered.client_note, 'Manter os detalhes após conflito')
  console.log('OK: conflito explicado em português, sem criar reserva; corrigir apenas o horário preserva contato, pagamento e notas.')
  writeFileSync(join(temp, 'barber.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  const barberLogin = await request('/auth/login', { email: 'barber@client-flow.test', password })
  const barberAuth = { cookie: barberLogin.cookie, csrf: barberLogin.body.csrf_token }
  const clientLogin = await request('/auth/login', { email: 'client@client-flow.test', password })
  const clientAuth = { cookie: clientLogin.cookie, csrf: clientLogin.body.csrf_token }
  const blockBody = { barber_user_id: barber.id, starts_at_utc: `${selectedDate}T17:00:00Z`, ends_at_utc: `${selectedDate}T17:15:00Z`, reason: 'Pausa' }
  async function mutationStatus(path, body, auth, method = 'POST') {
    const response = await fetch(`${origin}/api/v1${path}`, { method, headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: auth.cookie, 'X-CSRF-Token': auth.csrf }, body: JSON.stringify(body) })
    return response.status
  }
  assert.equal(await mutationStatus('/barber/blocks', blockBody, clientAuth), 403)
  assert.equal(await mutationStatus('/barber/blocks', { ...blockBody, barber_user_id: setup.body.user.id }, barberAuth), 403)
  assert.equal(await mutationStatus(`/appointments/${walkin.id}/details`, { client_note: 'Sem permissão' }, clientAuth, 'PATCH'), 403)
  assert.equal(await mutationStatus('/barber/blocks', { ...blockBody, starts_at_utc: `${selectedDate}T15:00:00Z`, ends_at_utc: `${selectedDate}T15:15:00Z` }, barberAuth), 409)
  const clientAppointments = (await request('/appointments', null, clientAuth)).body
  assert(clientAppointments.every(item => item.commission_cents == null))
  console.log('OK: cliente não pode alterar detalhes/bloquear agendas; barbeiro não bloqueia outro profissional; sobreposição é rejeitada.')
  console.log('OK: barbeiro cria encaixe com contato/pagamento/notas, inicia, recarrega, conclui, registra falta e bloqueia almoço persistente.')

  assert.deepEqual(runtimeErrors, [])
  console.log('OK: logout e proteção de sessão; nenhuma exceção no navegador.')
  console.log(`Captura mobile: ${join(temp, 'home.png')}`)
} catch (error) {
  console.error(error.message)
  if (evaluate) console.error(await evaluate('document.body.innerText').catch(() => 'Página indisponível'))
  console.error(logs.slice(-3).join('').slice(-2500))
  process.exitCode = 1
} finally {
  socket?.close()
  stopTestProcesses(processes)
}
