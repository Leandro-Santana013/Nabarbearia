import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const origin = 'https://na-barbearia.duckdns.org'
const decode = (value) => value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const attributes = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((match) => [match[1], decode(match[2])]))

function checkHtml(html, label) {
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => attributes(match[0]))
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((match) => attributes(match[0]))
  const values = (key) => metas.filter((item) => item.property === key || item.name === key).map((item) => item.content)
  const canonicals = links.filter((item) => item.rel === 'canonical')
  assert.equal(canonicals.length, 1, `${label}: canonical único`)
  assert.equal(canonicals[0].href, `${origin}/`)
  assert.equal(values('og:url')[0], `${origin}/`)
  assert.equal(values('og:image')[0], `${origin}/brand/og-cover.jpg`)
  assert.equal(values('og:image:width')[0], '1200')
  assert.equal(values('og:image:height')[0], '630')
  assert.ok(values('og:image:alt')[0]?.length)
  assert.equal(values('twitter:card')[0], 'summary_large_image')
  assert.equal(values('twitter:image')[0], values('og:image')[0])
  assert.ok(links.some((item) => item.rel === 'icon' && item.href === '/favicon.png'))
  assert.equal((html.match(/<title>/gi) ?? []).length, 1)
  assert.ok(values('description')[0]?.length)
  assert.equal(values('theme-color')[0], '#00749C')
  assert.equal(html.includes('fonts.googleapis.com'), false, `${label}: sem solicitação redundante de fonte externa`)
  const scripts = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
  assert.equal(scripts.length, 1)
  const data = JSON.parse(scripts[0][1])
  assert.equal(data['@type'], 'HairSalon')
  assert.equal(data.url, canonicals[0].href)
  assert.equal(data.telephone, '+5513974040190')
  assert.equal(data.address.addressCountry, 'BR')
  assert.equal(data.address.addressLocality, 'Santos')
  assert.equal(data.address.postalCode, '11020-001')
  assert.ok(data.openingHoursSpecification.some((entry) => entry.dayOfWeek.includes('https://schema.org/Sunday') && entry.opens === '00:00' && entry.closes === '00:00'))
  assert.equal('aggregateRating' in data || 'review' in data || 'rating' in data, false)
  assert.equal(JSON.stringify(data).includes('/illustrative/'), false)
  console.log(`OK: metadados iniciais, canonical e JSON-LD em ${label}.`)
}

checkHtml(readFileSync(join(root, 'dist/index.html'), 'utf8'), 'dist/index.html')
for (const asset of ['favicon.png', 'brand/og-cover.jpg', 'brand/na-team.webp', 'brand/na-logo-cutout.png']) {
  assert.equal(existsSync(join(root, 'dist', asset)), true, `Asset público ausente: ${asset}`)
}
const favicon = readFileSync(join(root, 'dist/favicon.png'))
assert.equal(favicon.subarray(1, 4).toString(), 'PNG')
assert.equal(favicon.readUInt32BE(16), 64)
assert.equal(favicon.readUInt32BE(20), 64)
const social = readFileSync(join(root, 'dist/brand/og-cover.jpg'))
assert.equal(social.readUInt16BE(0), 0xffd8)
let jpegSize
for (let offset = 2; offset + 8 < social.length;) {
  assert.equal(social[offset], 0xff, 'Marcador JPEG inválido')
  const marker = social[offset + 1]
  const length = social.readUInt16BE(offset + 2)
  if ([0xc0, 0xc1, 0xc2].includes(marker)) { jpegSize = { height: social.readUInt16BE(offset + 5), width: social.readUInt16BE(offset + 7) }; break }
  offset += length + 2
}
assert.deepEqual(jpegSize, { width: 1200, height: 630 })
console.log('OK: favicon 64×64 e imagem social JPEG 1200×630 presentes no build.')

if (process.argv[2]) {
  assert.equal(process.argv[2], '--origin', 'Uso: node scripts/check-public-metadata.mjs [--origin http://127.0.0.1:4173]')
  const localOrigin = new URL(process.argv[3])
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(localOrigin.hostname), 'A verificação servida aceita somente ambiente local')
  for (const path of ['/', '/painel', '/equipe/login']) {
    const response = await fetch(new URL(path, localOrigin), { signal: AbortSignal.timeout(10000) })
    assert.equal(response.status, 200)
    checkHtml(await response.text(), path)
  }
  console.log('OK: rotas SPA compartilham a identidade pública da raiz; canonical não é redirecionamento.')
}
