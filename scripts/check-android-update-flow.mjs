import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, unlinkSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createFlowTest } from './test-support/flow-test.mjs'

const test = createFlowTest('android-update')
const { send, evaluate, until, runtimeErrors } = test
const waitText = value => until(async () => (await evaluate('document.body.innerText')).includes(value), value)
const navigate = () => send('Page.navigate', { url: test.origin + '/equipe' })
try {
  await test.startBackend()
  const android = join(test.temp, 'android')
  mkdirSync(android)
  const release = JSON.parse(readFileSync(new URL('../tests/fixtures/android-release/cases.json', import.meta.url)))[0].value
  const manifest = join(android, 'release.json'), apk = join(android, 'NA-Barbearia-arm64-release.apk')
  writeFileSync(apk, 'apk')
  writeFileSync(manifest, JSON.stringify(release))
  await test.startBrowser()
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 740, deviceScaleFactor: 1, mobile: true })
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
  await navigate()
  await waitText('Acesso da equipe')
  assert(!(await evaluate('document.body.innerText')).includes('Atualize para continuar'))
  console.log('OK: navegador comum mantém login da equipe com APK anunciado.')

  // Hold the real version request to expose even a very short startup flash.
  const heldCheck = await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    const originalFetch = window.fetch.bind(window);
    window.releaseChecks = [];
    window.fetch = (input, options) => String(input) === '/api/v1/staff/android/release'
      ? new Promise(resolve => window.releaseChecks.push(() => resolve(originalFetch(input, options))))
      : originalFetch(input, options);
  ` })
  await send('Network.setUserAgentOverride', { userAgent: 'Mozilla/5.0 Android; wv) NABarbearia/2002' })
  await navigate()
  await until(() => evaluate('window.releaseChecks?.length > 0'), 'consulta de versão iniciada')
  await until(async () => (await evaluate('document.body.innerText')).includes('Acesso da equipe'), 'login visível durante consulta de versão', 2500)
  assert(!(await evaluate('document.body.innerText')).includes('Verificando atualizações'))
  assert.equal(await evaluate('getComputedStyle(document.documentElement).colorScheme'), 'light')
  assert.equal(await evaluate('getComputedStyle(document.documentElement).backgroundColor'), 'rgb(244, 244, 246)')
  await evaluate(`document.querySelector('input[type=email]').value = 'entrada-preservada@example.test'; window.loginInput = document.querySelector('input[type=email]'); window.releaseChecks.shift()()`)
  await until(() => evaluate('window.releaseChecks.length === 0'), 'consulta liberada')
  await evaluate("document.dispatchEvent(new Event('visibilitychange'))")
  await until(() => evaluate('window.releaseChecks.length > 0'), 'nova consulta ao retomar')
  assert(await evaluate("window.loginInput === document.querySelector('input[type=email]') && window.loginInput.value === 'entrada-preservada@example.test'"), 'Retomar não pode desmontar a tela de acesso')
  await evaluate('window.releaseChecks.shift()()')
  console.log('OK: abertura e retomada consultam versão sem tela intermediária nem desmontar o login.')

  // Restore normal requests for the remaining real-backend scenarios.
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: heldCheck.identifier })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    const originalFetch = window.fetch.bind(window);
    window.releaseResponses = [];
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (String(args[0]) === '/api/v1/staff/android/release') window.releaseResponses.push(response.status);
      return response;
    };
  ` })

  await send('Network.setUserAgentOverride', { userAgent: 'Mozilla/5.0 Android; wv) NABarbearia/2001' })
  await navigate()
  await waitText('Atualize para continuar')
  assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
  writeFileSync(join(test.temp, 'update-320.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent.includes('Atualizar aplicativo')).click()")
  await waitText('Entre com sua conta da equipe para instalar a atualização.')
  console.log('OK: versão anterior exige atualização e solicita conta da equipe para download.')

  // Same length, wrong hash: invalid metadata cannot advertise an update.
  // A failed background check must not replace the app with an error page.
  writeFileSync(apk, 'bad')
  await navigate()
  await until(() => evaluate('window.releaseResponses.some(status => status >= 500)'), 'falha da consulta inicial')
  await waitText('Acesso da equipe')
  assert(!(await evaluate('document.body.innerText')).includes('Não foi possível verificar a versão'))
  writeFileSync(apk, 'apk')
  await evaluate("document.dispatchEvent(new Event('visibilitychange'))")
  await waitText('Atualize para continuar')
  writeFileSync(apk, 'bad')
  await evaluate("window.releaseResponses = []; document.dispatchEvent(new Event('visibilitychange'))")
  await until(() => evaluate('window.releaseResponses.some(status => status >= 500)'), 'falha da reconsulta após atualização confirmada')
  assert((await evaluate('document.body.innerText')).includes('Atualize para continuar'), 'Falha na reconsulta não pode liberar atualização já confirmada')
  writeFileSync(apk, 'apk')
  console.log('OK: falha de consulta é silenciosa, retomar tenta novamente e atualização confirmada continua obrigatória.')

  await send('Network.setUserAgentOverride', { userAgent: 'Mozilla/5.0 Android; wv) NABarbearia/2002' })
  await navigate()
  await waitText('Acesso da equipe')
  unlinkSync(manifest)
  unlinkSync(apk)
  await send('Network.setUserAgentOverride', { userAgent: 'Mozilla/5.0 Android; wv) NABarbearia/2001' })
  await navigate()
  await waitText('Acesso da equipe')
  assert.deepEqual(runtimeErrors, [])
  console.log('OK: versão atual e 204 permitem continuar; 204 significa nenhum APK anunciado.')
  console.log(`Captura: ${join(test.temp, 'update-320.png')}`)
} catch (error) {
  await test.reportFailure(error)
  process.exitCode = 1
} finally { await test.close() }
