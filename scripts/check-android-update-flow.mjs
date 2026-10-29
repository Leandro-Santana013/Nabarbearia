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
  await navigate()
  await waitText('Acesso da equipe')
  assert(!(await evaluate('document.body.innerText')).includes('Atualize para continuar'))
  console.log('OK: navegador comum mantém login da equipe com APK anunciado.')

  await send('Network.setUserAgentOverride', { userAgent: 'Mozilla/5.0 Android; wv) NABarbearia/2001' })
  await navigate()
  await waitText('Atualize para continuar')
  assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
  writeFileSync(join(test.temp, 'update-320.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent.includes('Atualizar aplicativo')).click()")
  await waitText('Entre com sua conta da equipe para instalar a atualização.')
  console.log('OK: versão anterior exige atualização e solicita conta da equipe para download.')

  // Same length, wrong hash: the server refuses to advertise and UI fails closed.
  writeFileSync(apk, 'bad')
  await navigate()
  await waitText('Não foi possível verificar a versão')
  writeFileSync(apk, 'apk')
  await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent.includes('Tentar novamente')).click()")
  await waitText('Atualize para continuar')
  console.log('OK: corrupção de hash bloqueia acesso; repetir após recuperação reconsulta API real.')

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
