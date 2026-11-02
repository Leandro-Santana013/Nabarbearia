import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createFlowTest } from './test-support/flow-test.mjs'

// Real API/SQLite and a separate Chrome profile; never run with another flow
// that uses ports 3011/9224. Only the temporary test database is mutated.
const test = createFlowTest('landing-intent')
const { token, password, request, send, evaluate, until, runtimeErrors } = test
const intentKey = 'na:landing-booking-intent:v1'
const text = async () => (await evaluate('document.body.innerText')).replace(/\u00a0/g, ' ')
const waitText = (value) => until(async () => (await text()).includes(value), value)
const waitPath = (value) => until(() => evaluate(`location.pathname === ${JSON.stringify(value)}`), `rota ${value}`)
const navigate = (path) => send('Page.navigate', { url: test.origin + path })
const storedIntent = () => evaluate(`JSON.parse(sessionStorage.getItem(${JSON.stringify(intentKey)}) || 'null')`)
const clickSelector = async (selector) => {
  await until(() => evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled)`), selector)
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
}
const click = async (label) => {
  await until(() => evaluate(`Boolean([...document.querySelectorAll('button')].find(b => !b.disabled && b.textContent.trim() === ${JSON.stringify(label)}))`), `botão ${label}`)
  await evaluate(`[...document.querySelectorAll('button')].find(b => !b.disabled && b.textContent.trim() === ${JSON.stringify(label)}).click()`)
}
const fill = (name, value) => evaluate(`(() => {
  const input = document.querySelector('input[name=' + ${JSON.stringify(name)} + ']');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
})()`)
const chooseService = (id) => clickSelector(`button.public-service-choice[data-service-id=${JSON.stringify(id)}]`)
const chooseProfessional = (id) => clickSelector(`button.public-professional-choice[data-barber-id=${JSON.stringify(id)}]`)
const appointmentCount = () => evaluate("fetch('/api/v1/appointments').then(r => r.json()).then(items => items.length)")
const selectedProfessional = () => evaluate(`(() => {
  const radio = document.querySelector('[role="radio"][aria-checked="true"]');
  const input = document.querySelector('input[type="radio"]:checked');
  return {
    value: input?.value ?? null,
    label: (radio?.getAttribute('aria-labelledby') ?? '').split(/\\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' ').trim(),
    radioId: radio?.id ?? null,
  };
})()`)
async function login(email, secret = password) {
  await waitText('Bem-vindo de volta!')
  await fill('email', email)
  await fill('password', secret)
  await click('Entrar')
}
async function logoutClient() {
  await navigate('/perfil')
  await waitText('Meu Perfil')
  await click('Sair da Conta')
  await waitText('Bem-vindo de volta!')
  assert.equal(await storedIntent(), null, 'Logout deve descartar a escolha da conta anterior.')
}
async function revokeBrowserSession() {
  const status = await evaluate(`(async () => {
    const current = await (await fetch('/api/v1/auth/session')).json();
    return (await fetch('/api/v1/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': current.csrf_token }, body: '{}' })).status;
  })()`)
  assert.equal(status, 200)
}
async function putOwner(path, input, owner) {
  const response = await fetch(`${test.origin}/api/v1${path}`, {
    method: 'PUT', headers: { Origin: test.origin, 'Content-Type': 'application/json', Cookie: owner.cookie, 'X-CSRF-Token': owner.csrf },
    body: JSON.stringify(input), signal: AbortSignal.timeout(10000),
  })
  assert.equal(response.status, 200, `Alteração isolada ${path}`)
}
async function capture(filename) {
  writeFileSync(join(test.temp, filename), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
}

try {
  await test.startBackend()
  const setup = await request('/setup/owner', { business_name: 'NA Intenção', timezone: 'America/Sao_Paulo', email: 'owner@landing-intent.test', password, display_name: 'Dono Intenção' }, null, { 'X-Bootstrap-Token': token })
  const owner = { cookie: setup.cookie, csrf: setup.body.csrf_token }
  const serviceInputs = [
    { name: 'Corte Intenção', description: 'Corte da API isolada.', category: 'Cabelo', price_cents: 4599, duration_minutes: 30, active: true },
    { name: 'Barba Intenção', description: 'Barba da API isolada.', category: 'Barba', price_cents: 3275, duration_minutes: 25, active: true },
  ]
  const services = []
  for (const input of serviceInputs) services.push((await request('/admin/services', input, owner)).body)
  const barbers = []
  for (const [index, name] of ['Primeiro Intenção', 'Segundo Intenção'].entries()) {
    const barber = (await request('/admin/barbers', { display_name: name, email: `barber${index}@landing-intent.test`, password }, owner)).body
    barbers.push(barber)
    for (let weekday = 0; weekday <= 6; weekday++) await request('/admin/schedules', { barber_user_id: barber.id, weekday, start_minute: 540, end_minute: 1200 }, owner)
  }
  const otherClient = (await request('/auth/register', { display_name: 'Outra Conta', email: 'other@landing-intent.test', password })).body

  await test.startBrowser()
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const original = window.fetch.bind(window);
    window.intentFlowRequests = [];
    window.fetch = (url, init = {}) => {
      window.intentFlowRequests.push({ url: typeof url === 'string' ? url : url.url, method: init.method || 'GET' });
      return original(url, init);
    };
  })();` })
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })

  // Service selected before authentication survives an unsuccessful login,
  // switching to registration, successful registration and a document reload.
  await navigate('/')
  await evaluate(`(() => {
    const original = window.fetch;
    let failAuth = true;
    window.fetch = (url, init) => {
      if (failAuth && url === '/api/v1/auth/session') { failAuth = false; return Promise.reject(new TypeError('Temporary auth transport failure')); }
      return original(url, init);
    };
  })()`)
  await chooseService(services[0].id)
  await waitText('Não foi possível iniciar sua escolha.')
  assert.equal(await evaluate('location.pathname'), '/')
  assert.equal(await storedIntent(), null)
  await chooseService(services[0].id)
  await waitText('Bem-vindo de volta!')
  assert.equal((await storedIntent()).serviceId, services[0].id)
  await login('missing@landing-intent.test', 'incorrect-password')
  await waitText('E-mail ou senha incorretos.')
  assert.equal((await storedIntent()).serviceId, services[0].id)
  await click('Cadastre-se')
  await waitText('Crie sua conta')
  await fill('name', 'Cliente Intenção')
  await fill('email', 'client@landing-intent.test')
  await fill('password', password)
  await click('Criar conta')
  await waitPath('/servico')
  await waitText('Corte Intenção')
  assert((await text()).includes('R$ 45,99'))
  assert.equal(await appointmentCount(), 0, 'Selecionar na landing e cadastrar não pode reservar.')
  const clientSession = await evaluate("fetch('/api/v1/auth/session').then(r => r.json())")
  assert.equal((await storedIntent()).ownerUserId, clientSession.user.id)
  await send('Page.reload')
  await waitText('Selecionar Profissional')
  await waitText('Corte Intenção')
  assert.equal((await storedIntent()).serviceId, services[0].id)
  await capture('service-resumed-390.png')
  await click('Cancelar escolha')
  assert.equal(await storedIntent(), null)
  await navigate('/servico')
  await waitText('Escolha um serviço para continuar')
  console.log('OK: serviço sobrevive a erro de login, cadastro e recarga; cancelar elimina a intenção sem criar reserva.')

  // Operational IDs come from the API, even for names absent from the editorial
  // team. Choosing a service later must retain the selected professional.
  await logoutClient()
  await navigate('/')
  await chooseProfessional(barbers[1].id)
  await login('client@landing-intent.test')
  await waitPath('/home')
  await waitText('Olá, Cliente Intenção')
  await until(() => evaluate("document.querySelector('[data-landing-intent]')?.textContent.includes('Segundo Intenção')"), 'profissional retomado na Home')
  await clickSelector('button[aria-label="Selecionar Barba Intenção"]')
  await waitPath('/servico')
  await waitText('Barba Intenção')
  assert.equal((await storedIntent()).barberId, barbers[1].id)
  assert.equal((await storedIntent()).serviceId, services[1].id)
  let selected = await selectedProfessional()
  assert.equal(selected.value, barbers[1].id, JSON.stringify(selected))
  assert.equal(selected.label, 'Segundo Intenção', JSON.stringify(selected))
  await send('Page.reload')
  await waitText('Selecionar Profissional')
  selected = await selectedProfessional()
  assert.equal(selected.value, barbers[1].id, JSON.stringify(selected))
  assert.equal(selected.label, 'Segundo Intenção', JSON.stringify(selected))
  await click('Escolher Horário')
  await waitText('Escolher Data e Horário')
  await until(() => evaluate(`window.intentFlowRequests.some(item => item.url.includes('/public/availability?') && new URL(item.url, location.origin).searchParams.get('barber_id') === ${JSON.stringify(barbers[1].id)} && new URL(item.url, location.origin).searchParams.get('service_id') === ${JSON.stringify(services[1].id)})`), 'disponibilidade revalidada para o par serviço/profissional')
  assert.equal(await appointmentCount(), 0)
  assert.equal(await evaluate("window.intentFlowRequests.some(item => item.method === 'POST' && item.url === '/api/v1/appointments')"), false)
  await capture('professional-calendar-390.png')
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const tomorrow = new Date(`${today}T12:00:00Z`)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  const dateLabel = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeZone: 'UTC' }).format(tomorrow)
  await clickSelector(`button[aria-label=${JSON.stringify(dateLabel)}]`)
  await clickSelector('[role="group"][aria-labelledby$="-time-heading"] button:not(:disabled)')
  await click('Revisar Agendamento')
  await waitText('Resumo do agendamento')
  await evaluate(`(() => {
    const original = window.fetch;
    let holdConfirmation = true;
    window.fetch = (url, init = {}) => {
      if (holdConfirmation && url === '/api/v1/appointments' && init.method === 'POST') {
        holdConfirmation = false;
        window.intentConfirmationPending = true;
        return new Promise((resolve, reject) => {
          window.releaseIntentConfirmation = () => {
            window.intentConfirmationPending = false;
            original(url, init).then(resolve, reject);
          };
        });
      }
      return original(url, init);
    };
  })()`)
  await click('Confirmar Agendamento')
  await until(() => evaluate(`Boolean(window.intentConfirmationPending && [...document.querySelectorAll('[data-landing-intent] button')].find(button => button.textContent.trim() === 'Cancelar escolha')?.disabled)`), 'cancelamento bloqueado enquanto a reserva está em confirmação')
  // A disabled action must not discard the preference while a booking request
  // is outstanding. Release the held request only after observing that state.
  await evaluate(`document.querySelector('[data-landing-intent] button').click()`)
  assert.equal((await storedIntent()).barberId, barbers[1].id)
  assert.equal(await evaluate('location.pathname'), '/horarios')
  await evaluate('window.releaseIntentConfirmation()')
  await waitText('Agendamento Confirmado!')
  assert.equal(await appointmentCount(), 1)
  assert.equal(await storedIntent(), null)
  await send('Page.reload')
  await waitText('Agendamento Confirmado!')
  assert.equal(await storedIntent(), null)
  console.log('OK: profissional operacional sobrevive ao login, serviço posterior e recarga; disponibilidade usa ambos os IDs e reserva exige confirmação explícita, que limpa a intenção.')

  // A professional or service can disappear between click and authentication.
  await logoutClient()
  await navigate('/')
  await chooseProfessional(barbers[0].id)
  await waitText('Bem-vindo de volta!')
  await putOwner(`/admin/barbers/${barbers[0].id}`, { display_name: 'Primeiro Intenção', active: false }, owner)
  await login('client@landing-intent.test')
  await waitText('não está mais disponível')
  assert.equal(await storedIntent(), null)
  await putOwner(`/admin/barbers/${barbers[0].id}`, { display_name: 'Primeiro Intenção', active: true }, owner)
  await logoutClient()
  await navigate('/')
  await chooseService(services[1].id)
  await waitText('Bem-vindo de volta!')
  await putOwner(`/admin/services/${services[1].id}`, { ...serviceInputs[1], active: false }, owner)
  await login('client@landing-intent.test')
  await waitText('não está mais disponível')
  assert.equal(await storedIntent(), null)
  await putOwner(`/admin/services/${services[1].id}`, serviceInputs[1], owner)
  console.log('OK: profissional e serviço desativados na API durante o acesso são descartados com aviso, sem substituição silenciosa.')

  // Corrupted/stale/cross-account preferences must not turn into draft state.
  const invalidPayloads = [
    '{invalid-json',
    JSON.stringify({ version: 1, createdAt: Date.now() - 31 * 60 * 1000, ownerUserId: clientSession.user.id, serviceId: services[0].id }),
    JSON.stringify({ version: 1, createdAt: Date.now(), ownerUserId: otherClient.user.id, serviceId: services[0].id, barberId: barbers[0].id }),
    JSON.stringify({ version: 1, createdAt: Date.now(), ownerUserId: null, serviceId: services[0].id, redirect: 'https://example.invalid/' }),
  ]
  for (const payload of invalidPayloads) {
    await evaluate(`sessionStorage.setItem(${JSON.stringify(intentKey)}, ${JSON.stringify(payload)})`)
    await navigate('/servico')
    await waitText('Escolha um serviço para continuar')
    assert.equal(await storedIntent(), null)
    assert.equal(await evaluate("document.querySelector('[data-landing-intent]') === null"), true)
  }
  console.log('OK: JSON inválido, expiração, conta diferente e campos arbitrários são rejeitados após recarga.')

  // Replace the real session cookie while the same ClientApp remains mounted.
  // Provider resume must clear both its in-memory draft and the old account's
  // persisted preference, rather than only rejecting crafted storage on reload.
  await navigate('/')
  await chooseProfessional(barbers[1].id)
  await waitPath('/home')
  await waitText('Olá, Cliente Intenção')
  await clickSelector('button[aria-label="Selecionar Corte Intenção"]')
  await waitPath('/servico')
  await waitText('Selecionar Profissional')
  assert.equal((await storedIntent()).ownerUserId, clientSession.user.id)
  assert.equal((await storedIntent()).barberId, barbers[1].id)
  assert.equal((await storedIntent()).serviceId, services[0].id)
  const changedSession = await evaluate(`(async () => {
    const response = await fetch('/api/v1/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'other@landing-intent.test', password: ${JSON.stringify(password)} }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error('Falha ao trocar a sessão isolada.');
    window.dispatchEvent(new Event('staff-resume'));
    return { id: body.user.id, status: response.status };
  })()`)
  assert.equal(changedSession.status, 200)
  assert.equal(changedSession.id, otherClient.user.id)
  await waitText('Escolha um serviço para continuar')
  assert.equal(await evaluate('location.pathname'), '/servico')
  assert.equal(await storedIntent(), null)
  assert.equal(await evaluate("document.querySelector('[data-landing-intent]') === null"), true)
  assert.equal(await evaluate("fetch('/api/v1/auth/session').then(r => r.json()).then(body => body.user.id)"), otherClient.user.id)
  assert.equal(await appointmentCount(), 0, 'A outra conta não pode receber a reserva ou seleção anterior.')
  assert.equal(await evaluate("window.intentFlowRequests.some(item => item.method === 'POST' && item.url === '/api/v1/appointments')"), false)
  await logoutClient()
  await login('client@landing-intent.test')
  await waitPath('/home')
  await waitText('Olá, Cliente Intenção')
  assert.equal(await storedIntent(), null)
  assert.equal(await appointmentCount(), 1, 'A conta original conserva somente a reserva já confirmada.')
  console.log('OK: troca real de A para B com ClientApp montado limpa intenção e seleção em memória; nenhuma reserva é criada ou transportada entre contas.')

  // Current authenticated client takes the same path without another login.
  await navigate('/')
  await chooseService(services[0].id)
  await waitPath('/servico')
  await waitText('Corte Intenção')
  assert.equal((await storedIntent()).ownerUserId, clientSession.user.id)
  await navigate('/')
  await chooseService(services[1].id)
  await waitPath('/servico')
  await waitText('Barba Intenção')
  assert.equal((await storedIntent()).serviceId, services[1].id)
  await logoutClient()
  await navigate('/')
  await chooseService(services[0].id)
  await waitText('Bem-vindo de volta!')
  await click('Continuar como visitante')
  await waitText('Visitante')
  assert.equal(await storedIntent(), null)
  console.log('OK: sessão de cliente retoma diretamente, nova escolha substitui a anterior, logout e continuação como visitante descartam a preferência.')

  // Other roles must retain their authorized homes and not carry an intention
  // back into a later client session.
  for (const [email, destination, heading] of [
    ['barber0@landing-intent.test', '/barbeiro', 'Olá, Primeiro Intenção!'],
    ['owner@landing-intent.test', '/gestao/financeiro', 'Painel de Gestão'],
  ]) {
    await navigate('/')
    await chooseService(services[0].id)
    await login(email)
    await waitPath(destination)
    await waitText(heading)
    assert.equal(await storedIntent(), null)
    await revokeBrowserSession()
  }
  assert.deepEqual(runtimeErrors, [])
  console.log('OK: barbeiro e proprietário mantêm seus destinos autorizados e descartam a intenção de cliente.')
  console.log(`Evidências: ${test.temp}`)
} catch (error) {
  await test.reportFailure(error)
  process.exitCode = 1
} finally { await test.close() }
