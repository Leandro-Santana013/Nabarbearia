import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createFlowTest } from './test-support/flow-test.mjs'

const test = createFlowTest('landing-catalog')
const { token, password, request, send, evaluate, until, runtimeErrors } = test
const prices = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const normalize = (value) => value.replace(/\s/g, ' ')

try {
  await test.startBackend()
  const setup = await request('/setup/owner', {
    business_name: 'NA Catálogo Teste', timezone: 'America/Sao_Paulo',
    email: 'owner@landing-catalog.test', password, display_name: 'Proprietário Teste',
  }, null, { 'X-Bootstrap-Token': token })
  const owner = { cookie: setup.cookie, csrf: setup.body.csrf_token }
  const examples = [
    { name: 'Corte da API isolada', category: 'Cabelo', price_cents: 4875, duration_minutes: 35 },
    { name: 'Barba da API isolada', category: 'Barba', price_cents: 3275, duration_minutes: 25 },
    { name: 'Combo da API isolada', category: 'Combos', price_cents: 9175, duration_minutes: 65 },
  ]
  for (const example of examples) await request('/admin/services', { ...example, description: '', active: true }, owner)
  await request('/admin/services', { name: 'Serviço inativo isolado', category: 'Cabelo', description: '', price_cents: 100, duration_minutes: 10, active: false }, owner)
  await request('/admin/services', { name: 'Categoria extra isolada', category: 'Outros', description: '', price_cents: 7500, duration_minutes: 20, active: true }, owner)

  const catalog = (await request('/public/services')).body
  assert.equal(catalog.length, 4)
  assert.equal(catalog.some((item) => item.name === 'Serviço inativo isolado'), false)
  await test.startBrowser()
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await send('Page.navigate', { url: test.origin })
  await until(() => evaluate(`document.querySelector('.public-catalog-note')?.dataset.state === 'success'`), 'catálogo real disponível na landing')
  const rendered = await evaluate(`Array.from(document.querySelectorAll('.public-service-item'), function(item) {
    return { name: item.querySelector('strong').textContent, duration: item.querySelector('div > span').textContent, price: item.querySelector('.public-service-price').textContent };
  })`)
  assert.equal(rendered.length, 3)
  for (const expected of examples) {
    const item = rendered.find((candidate) => candidate.name === expected.name)
    assert.ok(item, `Serviço da API ausente: ${expected.name}`)
    assert.equal(normalize(item.price), normalize(prices.format(expected.price_cents / 100)))
    assert.equal(item.duration, `${expected.duration_minutes} min`)
  }
  assert.equal(rendered.some((item) => item.name === 'Categoria extra isolada'), false)
  assert.equal(await evaluate(`document.querySelectorAll('.public-visit-info address').length`), 1)
  assert.equal(await evaluate(`document.querySelectorAll('#localizacao iframe').length`), 1)
  await evaluate(`document.querySelector('#experiencia').scrollIntoView({ behavior: 'instant' })`)
  writeFileSync(join(test.temp, 'landing-catalog-390.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  await evaluate(`document.querySelector('.public-hero-actions a[href="/painel"]').click()`)
  await until(() => evaluate(`location.pathname === '/painel' && document.body.innerText.includes('Bem-vindo de volta!')`), 'CTA mantém acesso de visitante')
  assert.deepEqual(runtimeErrors, [])
  console.log('OK: preços e durações exibidos vêm da API/SQLite isolados; inativos e categorias não mapeadas não contaminam a vitrine.')
  console.log('OK: localização única e entrada de visitante pelo agendamento preservadas.')
  console.log(`Evidências: ${test.temp}`)
} catch (error) {
  await test.reportFailure(error)
  process.exitCode = 1
} finally {
  await test.close()
}
