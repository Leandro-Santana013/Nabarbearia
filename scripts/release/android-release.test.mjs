import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { APK_NAME, prepareVerifiedAndroidRelease, validateAndroidRelease } from './android-release.mjs'

const cases = JSON.parse(readFileSync(new URL('../../tests/fixtures/android-release/cases.json', import.meta.url)))
for (const { name, valid, value } of cases) {
  test(`contrato compartilhado: ${name}`, () => {
    if (valid) assert.ok(validateAndroidRelease(value).version_code > 0)
    else assert.throws(() => validateAndroidRelease(value))
  })
}

test('preparação recusa divergências antes de disponibilizar o par', () => {
  const root = mkdtempSync(join(tmpdir(), 'na-delivery-'))
  try {
    const apk = join(root, 'signed.apk'), properties = join(root, 'tauri.properties'), directory = join(root, 'output')
    writeFileSync(apk, 'apk')
    writeFileSync(properties, 'tauri.android.versionCode=2002\r\ntauri.android.versionName=0.2.2\r\n')
    const metadata = { packageName: 'br.com.nabarbearia.app', version_code: 2002, version_name: '0.2.2', certificate: 'a'.repeat(64) }
    const options = { apk, properties, directory, metadata, expectedCertificate: metadata.certificate }
    for (const change of [{ version_code: 2001 }, { version_name: '0.2.1' }, { packageName: 'other.app' }, { certificate: 'b'.repeat(64) }]) {
      assert.throws(() => prepareVerifiedAndroidRelease({ ...options, metadata: { ...metadata, ...change } }))
      assert.equal(existsSync(directory), false)
    }
    const release = prepareVerifiedAndroidRelease(options)
    assert.deepEqual(release, cases[0].value)
    assert.equal(readFileSync(join(directory, APK_NAME), 'utf8'), 'apk')
    assert.deepEqual(JSON.parse(readFileSync(join(directory, 'release.json'))), release)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
