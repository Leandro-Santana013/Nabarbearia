import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createFlowTest } from './test-support/flow-test.mjs'

const test = createFlowTest('access')
const { token, password, request, send, evaluate, until, runtimeErrors } = test
const text = () => evaluate('document.body.innerText')
const waitText = (value) => until(async () => (await text()).includes(value), value)
const waitPath = (path) => until(() => evaluate(`location.pathname === ${JSON.stringify(path)}`), `rota ${path}`)
const navigate = (path) => send('Page.navigate', { url: test.origin + path })
const click = async (selector) => {
  await until(() => evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled)`), selector)
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
}
async function login(email) {
  await waitText('Bem-vindo de volta!')
  await evaluate(`(() => {
    for (const [name, value] of ${JSON.stringify([['email', ''], ['password', password]])}) {
      const input = document.querySelector('input[name="' + name + '"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, name === 'email' ? ${JSON.stringify(email)} : value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    document.querySelector('button[type="submit"]').click();
  })()`)
}
async function revokeSession() {
  const status = await evaluate(`(async () => {
    const session = await (await fetch('/api/v1/auth/session')).json();
    return (await fetch('/api/v1/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf_token }, body: '{}' })).status;
  })()`)
  assert.equal(status, 200)
}
try {
  await test.startBackend()
  const setup = await request('/setup/owner', { business_name: 'NA Acesso', timezone: 'America/Sao_Paulo', email: 'owner@access.test', password, display_name: 'Proprietário Acesso' }, null, { 'X-Bootstrap-Token': token })
  const owner = { cookie: setup.cookie, csrf: setup.body.csrf_token }
  await request('/admin/barbers', { display_name: 'Barbeiro Acesso', email: 'barber@access.test', password }, owner)
  await request('/auth/register', { display_name: 'Cliente Acesso', email: 'client@access.test', password })
  await test.startBrowser()
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 740, deviceScaleFactor: 1, mobile: true })

  for (const path of ['/painel', '/agendar', '/barbeiro', '/gestao']) {
    await navigate(path)
    await waitText('Bem-vindo de volta!')
  }
  console.log('OK: visitante recebe login nas entradas antigas e nos painéis protegidos.')

  for (const [email, destination, heading] of [
    ['client@access.test', '/home', 'Olá, Cliente Acesso'],
    ['barber@access.test', '/barbeiro', 'Olá, Barbeiro Acesso!'],
    ['owner@access.test', '/gestao/financeiro', 'Painel de Gestão'],
  ]) {
    await navigate('/login')
    await login(email)
    await waitPath(destination)
    await waitText(heading)
    for (const legacy of ['/painel', '/agendar']) {
      await navigate(legacy)
      await waitPath(destination)
      await waitText(heading)
    }
    if (email.startsWith('client')) {
      await navigate('/gestao')
      await waitText('Área exclusiva do proprietário')
      await navigate('/barbeiro')
      await waitText('Área exclusiva do barbeiro')
      await navigate('/home')
      await waitText(heading)
      await evaluate("history.pushState({}, '', '/perfil'); dispatchEvent(new Event('popstate'))")
      await waitText('Meu Perfil')
      await evaluate('history.back()')
      await waitPath('/home')
      await waitText(heading)
      await evaluate('history.forward()')
      await waitPath('/perfil')
      await waitText('Meu Perfil')
    }
    if (!email.startsWith('owner')) await revokeSession()
  }
  console.log('OK: três perfis conservam destinos de /painel e /agendar, permissões e voltar/avançar do navegador.')

  // Expire through a real protected operation, without dispatching a UI event.
  await revokeSession()
  await click('[aria-label="Atualizar gestão"]')
  await waitText('Sua sessão expirou.')
  await waitText('Bem-vindo de volta!')
  await login('owner@access.test')
  await waitText('Painel de Gestão')
  await navigate('/equipe')
  await waitPath('/equipe/gestao/financeiro')
  await waitText('Painel de Gestão')
  await revokeSession()
  await click('[aria-label="Atualizar gestão"]')
  await waitPath('/equipe/login')
  await waitText('Sua sessão expirou.')
  await waitText('Acesso da equipe')
  assert(!(await text()).includes('Continuar como visitante'))
  assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
  await evaluate('document.querySelector(\'input[name="email"]\').focus()')
  assert.equal(await evaluate('document.activeElement.name'), 'email')
  writeFileSync(join(test.temp, 'staff-expired-320.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  assert.deepEqual(runtimeErrors, [])
  console.log('OK: 401 real expira acesso público e equipe; novo login recupera painel e equipe retorna ao login exclusivo.')
  console.log(`Captura 320 px: ${join(test.temp, 'staff-expired-320.png')}`)
} catch (error) {
  await test.reportFailure(error)
  process.exitCode = 1
} finally { await test.close() }
