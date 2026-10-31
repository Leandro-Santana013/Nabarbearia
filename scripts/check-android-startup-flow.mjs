import assert from 'node:assert/strict'
import { createFlowTest } from './test-support/flow-test.mjs'

const test = createFlowTest('android-startup')
const { request, send, evaluate, until, password, token } = test
const ready = () => evaluate('document.documentElement.dataset.naReady === "true"')
const waitText = value => until(async () => (await evaluate('document.body.innerText')).includes(value), value)

async function startup(email, destination) {
  if (email) {
    assert.equal(await evaluate(`(async () => (await fetch('/api/v1/auth/staff/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:${JSON.stringify(email)},password:${JSON.stringify(password)}})
    })).status)()`), 200)
  }
  const hook = await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    const originalFetch = window.fetch.bind(window);
    window.held = [];
    window.fetch = (input, options) => {
      const path = String(input);
      const hold = path === '/api/v1/auth/session' || path.startsWith('/api/v1/appointments?') || path.startsWith('/api/v1/admin/summary?');
      return hold ? new Promise(resolve => window.held.push({path, release: () => resolve(originalFetch(input, options))})) : originalFetch(input, options);
    };
    window.releaseStartup = () => {
      window.fetch = originalFetch;
      window.held.splice(0).forEach(item => item.release());
    };
  ` })
  try {
    await send('Page.navigate', { url: test.origin + '/equipe' })
    await until(() => evaluate('window.held?.some(item => item.path === "/api/v1/auth/session") && !!document.querySelector("main")'), 'sessão pendente')
    assert.equal((await evaluate('document.body.innerText')).trim(), '', 'A validação da sessão não deve exibir mensagem, login ou painel antes da resposta')
    assert.equal(await evaluate('getComputedStyle(document.querySelector("main")).backgroundColor'), 'rgb(244, 244, 246)')
    assert.equal(await ready(), false, 'Não liberar logo antes da sessão')
    await evaluate('window.held.splice(0).forEach(item => item.release())')
    if (email) {
      await until(() => evaluate('window.held.length > 0'), 'dados iniciais pendentes')
      assert.equal(await ready(), false, 'Não liberar logo com agenda/gestão carregando')
    }
    await evaluate('window.releaseStartup()')
    await waitText(destination)
    await until(ready, 'sinal de interface pronta', 3000)
    const body = await evaluate('document.body.innerText')
    assert(!body.includes('Verificando sua sessão'))
    assert(!body.includes('Carregando agenda'))
    if (email) {
      await evaluate(`(() => {
        const originalFetch = window.fetch.bind(window);
        window.fetch = (input, options) => String(input) === '/api/v1/auth/session'
          ? new Promise(resolve => window.held.push({release: () => resolve(originalFetch(input, options))}))
          : originalFetch(input, options);
        window.startupPanel = document.querySelector('main');
        window.dispatchEvent(new Event('staff-resume'));
      })()`)
      await until(() => evaluate('window.held.length > 0'), 'revalidação de sessão em primeiro plano')
      assert.equal(await evaluate('window.startupPanel === document.querySelector("main")'), true, 'Retomar não deve desmontar o painel')
      await evaluate('window.releaseStartup()')
    }
    console.log('PASS: logo aguarda sessão e dados iniciais; destino pronto: ' + destination)
  } finally {
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: hook.identifier })
  }
}

try {
  await test.startBackend()
  const setup = await request('/setup/owner', { business_name:'NA Startup', timezone:'America/Sao_Paulo', email:'owner@startup.test', password, display_name:'Dono Startup' }, null, { 'X-Bootstrap-Token':token })
  await request('/admin/barbers', { email:'barber@startup.test', password, display_name:'Barbeiro Startup' }, { cookie:setup.cookie, csrf:setup.body.csrf_token })
  await test.startBrowser()
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 740, deviceScaleFactor: 1, mobile: true })
  await send('Page.navigate', { url:test.origin + '/equipe' })
  await waitText('Acesso da equipe')
  await startup(null, 'Acesso da equipe')
  await startup('barber@startup.test', 'Barbeiro Startup')
  await startup('owner@startup.test', 'Painel de Gestão')
  // A real connection error must release the logo to an actionable retry screen.
  const fail = await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, options) => String(input) === '/api/v1/auth/session'
      ? Promise.reject(new TypeError('offline')) : originalFetch(input, options);
  ` })
  await send('Page.navigate', { url:test.origin + '/equipe' })
  await waitText('Não foi possível conectar')
  await until(ready, 'erro de conexão pronto para tentar novamente')
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier:fail.identifier })
  assert.deepEqual(test.runtimeErrors, [])
  console.log('PASS: falha de conexão libera tela de recuperação; sem logo presa.')
} catch (error) {
  await test.reportFailure(error)
  process.exitCode = 1
} finally { await test.close() }
