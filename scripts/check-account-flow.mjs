import { createFlowTest } from './test-support/flow-test.mjs'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const test = createFlowTest('account')
const { temp, origin, token, password, until, request, send, evaluate, runtimeErrors } = test
try {
  await test.startBackend()
  const setup = await request('/setup/owner', { business_name: 'Contas Teste', timezone: 'America/Sao_Paulo', email: 'owner@account-flow.test', password, display_name: 'Owner' }, null, { 'X-Bootstrap-Token': token })
  const owner = { cookie: setup.cookie, csrf: setup.body.csrf_token }
  const barber = (await request('/admin/barbers', { email: 'barber@account-flow.test', password, display_name: 'Barbeiro Teste' }, owner)).body
  await request('/admin/commission-rules', { barber_user_id: barber.id, rule_type: 'percent', amount: 5000 }, owner)
  await request('/auth/register', { email: 'client@account-flow.test', password, display_name: 'Cliente Teste' })
  await test.startBrowser()
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')
  const text = () => evaluate('document.body.innerText')
  const waitText = (value) => until(async () => (await text()).includes(value), value)
  const navigate = (path) => send('Page.navigate', { url: origin + path })
  const click = async (label) => {
    await until(() => evaluate(`Boolean([...document.querySelectorAll('button')].find(b => !b.disabled && b.textContent.trim() === ${JSON.stringify(label)}))`), label)
    await evaluate(`[...document.querySelectorAll('button')].find(b => !b.disabled && b.textContent.trim() === ${JSON.stringify(label)}).click()`)
  }
  const fill = (name, value) => evaluate(`(() => {
    const input = document.querySelector('input[name=' + ${JSON.stringify(name)} + ']');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
  const login = async (email, enteredPassword) => {
    await fill('email', email); await fill('password', enteredPassword); await click('Entrar')
  }
  const screenshot = async (label) => writeFileSync(join(temp, label + '.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })).data, 'base64'))
  const reachableSave = async (label) => {
    await evaluate("document.querySelector('form[aria-label=\"Editar informações da conta\"] button[type=submit]').scrollIntoView({block:'center'})")
    await until(() => evaluate(`(() => {
      const button = document.querySelector('form[aria-label="Editar informações da conta"] button[type=submit]').getBoundingClientRect();
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop ?? 0;
      const bottom = document.querySelector('[aria-label="Navegação do barbeiro"]')?.getBoundingClientRect().top ?? (top + (viewport?.height ?? innerHeight));
      return button.top >= top && button.bottom <= bottom;
    })()`), label + ': salvar alcançável')
  }
  const layout = async (label) => {
    for (const width of [320, 390, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 })
      assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'), `${label}: overflow at ${width}`)
      await reachableSave(label + '-' + width)
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 640, height: 900, deviceScaleFactor: 1, mobile: true })
    await send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 })
    assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'), label + ': zoom overflow')
    await reachableSave(label + '-zoom')
    await screenshot(label + '-zoom')
    await send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 })
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 900, deviceScaleFactor: 1, mobile: true })
    await screenshot(label)
  }

  for (const role of ['client', 'barber']) {
    const client = role === 'client'
    await navigate(client ? '/login' : '/equipe/login')
    await waitText(client ? 'Bem-vindo de volta!' : 'Acesso da equipe')
    await login(`${role}@account-flow.test`, password)
    await waitText(client ? 'Olá, Cliente Teste' : 'Olá, Barbeiro Teste!')
    if (client) { await navigate('/perfil'); await waitText('Meu Perfil') } else await click('Perfil')
    const editLabel = client ? 'Informações da Conta' : 'Editar informações da conta'
    await click(editLabel)
    await fill('name', 'Descartar edição'); await click('Cancelar')
    assert(!(await text()).includes('Descartar edição'))
    await click(editLabel)
    const name = client ? 'Cliente Atualizado' : 'Barbeiro Atualizado'
    const email = `${role}-updated@account-flow.test`
    await fill('newPassword', password + 'A'); await fill('confirmPassword', password + 'A')
    await fill('newPassword', '')
    await fill('name', name); await fill('phone', '13999998888')
    await click('Salvar alterações'); await waitText('Informações da conta atualizadas.')
    await click(editLabel)
    await fill('name', name); await fill('phone', '13999998888'); await fill('email', email)
    await fill('newPassword', password + 'A'); await fill('confirmPassword', password + 'B')
    await fill('currentPassword', password)
    await click('Salvar alterações'); await waitText('A confirmação da nova senha não confere.')
    await fill('confirmPassword', password + 'A'); await fill('currentPassword', 'incorrect-password')
    await click('Salvar alterações'); await waitText('A senha atual está incorreta.')
    assert.equal(await evaluate("document.querySelector('input[name=name]').value"), name)
    await fill('currentPassword', password)
    await layout(role + '-account-form')
    await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
    await click('Salvar alterações'); await waitText('Não foi possível conectar à barbearia.')
    await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
    await click('Salvar alterações'); await waitText('Informações da conta atualizadas.')
    await waitText(email)
    await send('Page.reload'); await waitText(client ? 'Meu Perfil' : 'Olá, Barbeiro Atualizado!')
    if (!client) await click('Perfil')
    await waitText(email); await waitText('13999998888')
    await click(editLabel)
    assert.equal(await evaluate("document.querySelector('input[name=newPassword]').value"), '')
    assert.equal(await evaluate("document.querySelector('input[name=phone]').value"), '13999998888')
    await click('Cancelar')
    await click(client ? 'Sair da Conta' : 'Sair da conta')
    await waitText(client ? 'Bem-vindo de volta!' : 'Acesso da equipe')
    await login(email, password); await waitText('E-mail ou senha incorretos.')
    await login(email, password + 'A')
    await waitText(client ? 'Olá, Cliente Atualizado' : 'Olá, Barbeiro Atualizado!')
    if (client) { await navigate('/perfil'); await waitText('Meu Perfil') } else await click('Perfil')
    if (!client) {
      assert((await text()).includes('As regras de comissão são definidas exclusivamente pelo proprietário.'))
      const permission = await evaluate(`(async () => {
        const auth = await (await fetch('/api/v1/auth/session')).json();
        return (await fetch('/api/v1/admin/commission-rules', { method:'POST', headers:{'Content-Type':'application/json','X-CSRF-Token':auth.csrf_token}, body:JSON.stringify({barber_user_id:${JSON.stringify(barber.id)},rule_type:'percent',amount:9999}) })).status;
      })()`)
      assert.equal(permission, 403)
      await send('Page.reload'); await waitText('Olá, Barbeiro Atualizado!'); await click('Perfil')
    }
    await click(client ? 'Sair da Conta' : 'Sair da conta')
    console.log(`OK: ${role} edita dados, cancela, recupera de erros, persiste após recarga e entra com a nova senha.`)
  }
  assert.deepEqual(runtimeErrors, [])
  console.log(`OK: comissão protegida; formulários em 320/390/1440 px e zoom. Evidências: ${temp}`)
} catch (error) { await test.reportFailure(error); process.exitCode = 1 }
finally { await test.close() }
