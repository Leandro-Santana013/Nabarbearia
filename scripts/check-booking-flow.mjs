import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createFlowTest } from './test-support/flow-test.mjs'

const test = createFlowTest('booking')
const { token, password, request, send, evaluate, until, runtimeErrors } = test
const text = async () => (await evaluate('document.body.innerText')).replace(/\u00a0/g, ' ')
const waitText = (value) => until(async () => (await text()).includes(value), value)
const click = async (label) => {
  await until(() => evaluate(`Boolean([...document.querySelectorAll('button')].find(b => !b.disabled && b.textContent.trim() === ${JSON.stringify(label)}))`), `botão ${label}`)
  await evaluate(`[...document.querySelectorAll('button')].find(b => !b.disabled && b.textContent.trim() === ${JSON.stringify(label)}).click()`)
}
const clickSelector = async (selector) => {
  await until(() => evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled)`), selector)
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
}
const navigate = (path) => send('Page.navigate', { url: test.origin + path })
const appointments = () => evaluate("fetch('/api/v1/appointments').then(r=>r.json())")
const fill = (name, value) => evaluate(`(() => {
  const input = document.querySelector('input[name=' + ${JSON.stringify(name)} + ']');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
})()`)
async function capture(name) {
  writeFileSync(join(test.temp, name), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
}
try {
  await test.startBackend()
  const setup = await request('/setup/owner', { business_name: 'Reserva F2', timezone: 'America/Sao_Paulo', email: 'owner@booking.test', password, display_name: 'Dono F2' }, null, { 'X-Bootstrap-Token': token })
  const owner = { cookie: setup.cookie, csrf: setup.body.csrf_token }
  const serviceInput = { name: 'Corte F2', description: 'Reserva real de teste', category: 'Cabelo', price_cents: 4599, duration_minutes: 30, active: true }
  const service = (await request('/admin/services', serviceInput, owner)).body
  const barbers = []
  for (const [index, name] of ['Primeiro F2', 'Segundo F2'].entries()) {
    const barber = (await request('/admin/barbers', { display_name: name, email: `barber${index}@booking.test`, password }, owner)).body
    barbers.push(barber)
    for (let weekday = 0; weekday <= 6; weekday++) await request('/admin/schedules', { barber_user_id: barber.id, weekday, start_minute: 540, end_minute: 1200 }, owner)
  }
  const registered = await request('/auth/register', { display_name: 'Cliente F2', email: 'client@booking.test', password })
  const client = { cookie: registered.cookie, csrf: registered.body.csrf_token }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const sunday = new Date(`${today}T12:00:00Z`)
  do { sunday.setUTCDate(sunday.getUTCDate() + 1) } while (sunday.getUTCDay() !== 0)
  const date = sunday.toISOString().slice(0, 10)
  const dateLabel = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeZone: 'UTC' }).format(sunday)

  await test.startBrowser()
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Tokyo' })
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await navigate('/home')
  await waitText('Visitante')
  await clickSelector('button[aria-label="Selecionar Corte F2"]')
  await click('Escolher Horário')
  await waitText('Bem-vindo de volta!')
  await fill('email', 'client@booking.test')
  await fill('password', password)
  await click('Entrar')
  await waitText('Escolher Data e Horário')
  await clickSelector(`button[aria-label=${JSON.stringify(dateLabel)}]`)
  await clickSelector('button[aria-label="09:00"]')
  await click('Revisar Agendamento')
  await waitText('Resumo do agendamento')
  assert((await text()).includes('R$ 45,99'))
  assert((await text()).includes('Qualquer disponível'))
  await until(() => evaluate('Boolean(document.activeElement.getAttribute("aria-labelledby")?.endsWith("-review-heading"))'), 'foco no resumo')
  console.log('OK: visitante retoma reserva após autenticação; domingo e 09:00 vêm da escala operacional, com navegador em Tóquio.')

  for (const width of [320, 390, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 768 })
    await evaluate('document.fonts.ready')
    assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
    await evaluate('document.querySelector(\'[aria-labelledby$="-review-heading"]\').scrollIntoView({ block: "center", behavior: "instant" })')
    await capture(`reserva-${width}.png`)
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 })
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Confirmar Agendamento');
    button.focus(); button.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  })()`)
  await until(() => evaluate(`(() => {
    const button = document.activeElement;
    const rect = button.getBoundingClientRect();
    const view = visualViewport;
    return button.textContent.includes('Confirmar Agendamento') && rect.bottom > view.offsetTop && rect.top < view.offsetTop + view.height && rect.right > view.offsetLeft && rect.left < view.offsetLeft + view.width;
  })()`), 'confirmação alcançável com zoom 200%')
  await capture('reserva-zoom-200.png')
  await send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 })

  // Only the response is lost: the first POST reaches the real server and commits.
  await evaluate(`(() => {
    const original = window.fetch.bind(window);
    window.bookingRequests = [];
    let lose = true;
    window.fetch = async (url, init = {}) => {
      const target = typeof url === 'string' ? url : url.url;
      if (target === '/api/v1/appointments' && init.method === 'POST') {
        window.bookingRequests.push({ key: new Headers(init.headers).get('Idempotency-Key'), body: JSON.parse(init.body) });
        const response = await original(url, init);
        if (lose && response.ok) { lose = false; throw new TypeError('Failed to fetch: response lost after commit'); }
        return response;
      }
      return original(url, init);
    };
    const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Confirmar Agendamento');
    button.click(); button.click();
  })()`)
  await waitText('Não foi possível conectar à barbearia.')
  assert.equal((await appointments()).length, 1)
  assert.equal(await evaluate('bookingRequests.length'), 1)
  await click('Confirmar Agendamento')
  await waitText('Agendamento Confirmado!')
  let list = await appointments()
  assert.equal(list.length, 1)
  const first = list[0]
  assert.equal(first.price_cents, 4599)
  assert.equal(first.duration_minutes, 30)
  assert(barbers.some((barber) => barber.id === first.barber_user_id))
  assert.equal(await evaluate('bookingRequests[0].key === bookingRequests[1].key'), true)
  console.log('OK: clique repetido produz um POST; resposta perdida após gravação usa a mesma chave na repetição, sem duplicar reserva.')
  await send('Page.reload')
  await waitText('Agendamento Confirmado!')
  assert((await text()).includes('09:00'))

  const update = await fetch(`${test.origin}/api/v1/admin/services/${service.id}`, {
    method: 'PUT', headers: { Origin: test.origin, 'Content-Type': 'application/json', Cookie: owner.cookie, 'X-CSRF-Token': owner.csrf },
    body: JSON.stringify({ ...serviceInput, price_cents: 9900 }),
  })
  assert.equal(update.status, 200)
  await send('Page.reload')
  await waitText('Agendamento Confirmado!')
  await click('Ver Meus Agendamentos')
  await waitText('Meus Agendamentos')
  await click('Remarcar')
  await waitText('Escolher Data e Horário')
  assert((await text()).includes('R$ 45,99'))
  await clickSelector('button[aria-label="10:00"]')
  await click('Revisar Agendamento')
  await click('Confirmar Agendamento')
  await waitText('Agendamento Confirmado!')
  list = await appointments()
  assert.equal(list.length, 1)
  assert.equal(list[0].id, first.id)
  assert.equal(list[0].price_cents, 4599)
  assert.equal(list[0].duration_minutes, 30)
  assert.notEqual(list[0].starts_at, first.starts_at)
  console.log('OK: comprovante recuperado pelo ID após recarga; remarcação preserva ID, preço e duração históricos após reajuste do catálogo.')

  await navigate('/home')
  await waitText('Olá, Cliente F2')
  await clickSelector('button[aria-label="Selecionar Corte F2"]')
  await evaluate("[...document.querySelectorAll('label')].find(label => label.textContent.trim() === 'Primeiro F2').click()")
  await click('Escolher Horário')
  await waitText('Escolher Data e Horário')
  await clickSelector(`button[aria-label=${JSON.stringify(dateLabel)}]`)
  await clickSelector('button[aria-label="09:00"]')
  await click('Revisar Agendamento')
  await request('/appointments', { service_id: service.id, barber_user_id: barbers[0].id, starts_at: `${date}T12:00:00Z` }, client, { 'Idempotency-Key': 'concurrent-booking-f2' })
  await evaluate(`(() => {
    const original = window.fetch.bind(window);
    window.conflictKeys = [];
    window.fetch = (url, init = {}) => {
      if (url === '/api/v1/appointments' && init.method === 'POST') window.conflictKeys.push(new Headers(init.headers).get('Idempotency-Key'));
      return original(url, init);
    };
  })()`)
  await click('Confirmar Agendamento')
  await waitText('Este horário está indisponível ou bloqueado.')
  assert.equal((await appointments()).length, 2)
  await clickSelector('button[aria-label="11:00"]')
  await click('Revisar Agendamento')
  await click('Confirmar Agendamento')
  await waitText('Agendamento Confirmado!')
  assert.equal((await appointments()).length, 3)
  assert.equal(await evaluate('conflictKeys.length === 2 && conflictKeys[0] !== conflictKeys[1]'), true)
  assert.deepEqual(runtimeErrors, [])
  console.log('OK: conflito real não grava reserva extra; outro horário confirma com uma nova chave, preservando serviço e profissional.')
  console.log(`Capturas da reserva: ${test.temp}`)
} catch (error) {
  await test.reportFailure(error)
  process.exitCode = 1
} finally { await test.close() }
