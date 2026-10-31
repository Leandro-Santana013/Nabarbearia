import { createFlowTest } from './test-support/flow-test.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const test = createFlowTest('staff', { timeout: 60000 })
const { root, temp, origin, token, password, until, request, send, evaluate, runtimeErrors: errors } = test
try {
  await test.startBackend()
  const setup = await request('/setup/owner', { business_name: 'NA Teste', timezone: 'America/Sao_Paulo', email: 'owner@staff-flow.test', password, display_name: 'Dono Teste' }, null, { 'X-Bootstrap-Token': token })
  await request('/admin/barbers', { email: 'barber@staff-flow.test', password, display_name: 'Barbeiro Teste' }, { cookie: setup.cookie, csrf: setup.body.csrf_token })
  await request('/auth/register', { email: 'client@staff-flow.test', password, display_name: 'Cliente Teste' })
  await test.startBrowser()
  const text = () => evaluate('document.body.innerText')
  const waitText = (value) => until(async () => (await text()).includes(value), value)
  const navigate = (path) => send('Page.navigate', { url: origin + path })
  const click = async (label) => {
    await until(() => evaluate(`Boolean([...document.querySelectorAll('button')].find(b => !b.disabled && b.textContent.trim() === ${JSON.stringify(label)}))`), label)
    await evaluate(`[...document.querySelectorAll('button')].find(b => !b.disabled && b.textContent.trim() === ${JSON.stringify(label)}).click()`)
  }
  const login = async (email, enteredPassword = password) => {
    await evaluate(`(() => {
      for (const [name, value] of ${JSON.stringify([['email', ''], ['password', enteredPassword]])}) {
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
  await login('barber@staff-flow.test', 'incorrect-password')
  await waitText('E-mail ou senha incorretos.')
  assert.equal(await evaluate('document.querySelector(\'input[name="email"]\').value'), 'barber@staff-flow.test')
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
  await navigate('/equipe/download')
  await waitText('Acesso da equipe')
  await login('owner@staff-flow.test')
  await waitText('Baixar APK Android')
  assert.equal(await evaluate('location.pathname'), '/equipe/download')

  // A newer APK must take priority over both login and a saved dashboard URL.
  const originalAgent = (await send('Browser.getVersion')).userAgent
  const androidAgent = 'Mozilla/5.0 (Linux; Android 14; Test; wv) AppleWebKit/537.36 NABarbearia/'
  const androidDirectory = join(temp, 'android')
  mkdirSync(androidDirectory)
  const apkBytes = Buffer.alloc(12000000)
  writeFileSync(join(androidDirectory, 'NA-Barbearia-arm64-release.apk'), apkBytes)
  writeFileSync(join(androidDirectory, 'release.json'), JSON.stringify({ version_code: 2002, version_name: '0.2.2', size_bytes: apkBytes.length, sha256: createHash('sha256').update(apkBytes).digest('hex') }))
  await send('Network.setUserAgentOverride', { userAgent: androidAgent + '2001' })
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await navigate('/equipe/gestao/financeiro')
  await waitText('Atualize para continuar')
  assert(!(await text()).includes('Painel de Gestão'))
  assert(!(await text()).includes('Acesso da equipe'))
  assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
  mkdirSync(join(root, 'artifacts'), { recursive: true })
  const screenshot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(root, 'artifacts/android-update-screen.png'), Buffer.from(screenshot.data, 'base64'))
  await evaluate("history.pushState({}, '', '/equipe/barbeiro'); dispatchEvent(new Event('popstate'))")
  await waitText('Atualize para continuar')
  await evaluate(`(() => {
    const originalFetch = window.fetch.bind(window);
    window.restoreVersionFetch = () => { window.fetch = originalFetch; };
    window.versionCheckFailed = false;
    window.fetch = (...args) => originalFetch(...args).catch(error => {
      if (String(args[0]) === '/api/v1/staff/android/release') window.versionCheckFailed = true;
      throw error;
    });
  })()`)
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  await evaluate("dispatchEvent(new Event('staff-resume'))")
  await until(() => evaluate('window.versionCheckFailed'), 'falha da reconsulta de versão')
  assert((await text()).includes('Atualize para continuar'))
  assert(!(await text()).includes('Não foi possível verificar a versão'))
  await evaluate('window.restoreVersionFetch()')
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  await evaluate("dispatchEvent(new Event('staff-resume'))")
  await waitText('Atualize para continuar')
  await click('Atualizar aplicativo')
  await waitText('Baixando atualização…')
  await evaluate("dispatchEvent(new CustomEvent('na-android-update', { detail: { state: 'error', message: 'Falha de download simulada' } }))")
  await waitText('Falha de download simulada')
  await until(() => evaluate("[...document.querySelectorAll('button')].some(b => b.textContent.includes('Atualizar aplicativo') && !b.disabled)"), 'tentar download novamente')

  await send('Network.setUserAgentOverride', { userAgent: androidAgent + '2002' })
  await navigate('/equipe')
  await waitText('Painel de Gestão')
  await send('Network.setUserAgentOverride', { userAgent: androidAgent + '2003' })
  await navigate('/equipe')
  await waitText('Painel de Gestão')
  await send('Network.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Test; wv) AppleWebKit/537.36' })
  await navigate('/equipe')
  await waitText('Nesta versão, abra o arquivo pela notificação')
  await evaluate(`(async () => {
    const session = await (await fetch('/api/v1/auth/session')).json();
    await fetch('/api/v1/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf_token }, body: '{}' });
  })()`)
  await send('Network.setUserAgentOverride', { userAgent: androidAgent + '2001' })
  await navigate('/equipe/login')
  await waitText('Atualize para continuar')
  assert(!(await text()).includes('Acesso da equipe'))
  await click('Atualizar aplicativo')
  await waitText('Entre com sua conta da equipe para instalar a atualização.')
  await login('owner@staff-flow.test')
  await waitText('Baixando atualização…')
  await send('Network.setUserAgentOverride', { userAgent: originalAgent })
  await send('Emulation.clearDeviceMetricsOverride')
  await navigate('/equipe')
  await waitText('Painel de Gestão')
  assert.deepEqual(errors, [])
  console.log('OK: acesso da equipe, sessão e download; atualização antes do login/painel, retorno ao app, falha de rede/download, login para atualizar, versões iguais/maiores, APK antigo e navegador comum verificados.')
} catch (error) {
  await test.reportFailure(error)
  process.exitCode = 1
} finally {
  await test.close()
}
