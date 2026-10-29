import { createHash, randomUUID } from 'node:crypto'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

export const APK_NAME = 'NA-Barbearia-arm64-release.apk'

export function validateAndroidRelease(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !Number.isInteger(value.version_code) || value.version_code <= 0 || value.version_code > 2147483647 ||
      typeof value.version_name !== 'string' || !value.version_name.trim() ||
      !Number.isSafeInteger(value.size_bytes) || value.size_bytes <= 0 ||
      typeof value.sha256 !== 'string' || value.sha256.length !== 64 || !/^[a-f0-9]{64}$/.test(value.sha256)) {
    throw new Error('Manifesto Android inválido.')
  }
  return Object.fromEntries(['version_code', 'version_name', 'size_bytes', 'sha256'].map(key => [key, value[key]]))
}

export function apkMetadata(apk, { aapt, apksigner, java }) {
  apk = resolve(apk)
  function run(command, args) {
    const result = spawnSync(command, args, { cwd: dirname(apk), encoding: 'utf8', shell: false })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`Verificação Android falhou: ${command} (código ${result.status}). ${result.stderr?.slice(-500) ?? ''}`)
    return result.stdout
  }
  const badging = run(aapt, ['dump', 'badging', basename(apk)])
  const match = /^package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/m.exec(badging)
  const signature = run(java, ['-jar', apksigner, 'verify', '--print-certs', basename(apk)])
  const certificates = [...signature.matchAll(/Signer #\d+ certificate SHA-256 digest: ([a-f0-9]{64})/gi)]
  const certificate = certificates[0]?.[1]?.toLowerCase()
  if (!match || certificates.length !== 1 || !certificate) throw new Error('Não foi possível inspecionar pacote/assinatura única do APK.')
  return { packageName: match[1], version_code: Number(match[2]), version_name: match[3], certificate }
}

// Inspect the actual signed APK, rather than trusting properties left by a previous build.
export function prepareAndroidRelease({ apk, properties, directory, tools, expectedCertificate }) {
  // Inspect and publish the same snapshot. An ASCII temp path also supports aapt on Windows.
  const staging = mkdtempSync(join(tmpdir(), 'na-apk-check-'))
  try {
    const snapshot = join(staging, 'release.apk')
    copyFileSync(apk, snapshot)
    return prepareVerifiedAndroidRelease({ apk: snapshot, properties, directory, expectedCertificate, metadata: apkMetadata(snapshot, tools) })
  } finally { rmSync(staging, { recursive: true, force: true }) }
}

export function prepareVerifiedAndroidRelease({ apk, properties, directory, metadata, expectedCertificate }) {
  if (expectedCertificate?.length !== 64 || !/^[a-f0-9]{64}$/.test(expectedCertificate)) throw new Error('Informe o SHA-256 do certificado aprovado em NABARBEARIA_ANDROID_CERT_SHA256.')
  const text = readFileSync(properties, 'utf8')
  const versionCode = Number(text.match(/^tauri.android.versionCode=(\d+)\r?$/m)?.[1])
  const versionName = text.match(/^tauri.android.versionName=(.+)$/m)?.[1]?.trim()
  if (metadata.packageName !== 'br.com.nabarbearia.app' || metadata.certificate !== expectedCertificate ||
      metadata.version_code !== versionCode || metadata.version_name !== versionName) {
    throw new Error('Pacote, assinatura ou versão embutida do APK diverge da entrega esperada.')
  }
  const bytes = readFileSync(apk)
  const manifest = validateAndroidRelease({ version_code: versionCode, version_name: versionName,
    size_bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
  mkdirSync(directory, { recursive: true })
  const staging = join(directory, `.android-${randomUUID()}`)
  mkdirSync(staging)
  try {
    copyFileSync(apk, join(staging, APK_NAME))
    const staged = readFileSync(join(staging, APK_NAME))
    if (statSync(join(staging, APK_NAME)).size !== manifest.size_bytes || createHash('sha256').update(staged).digest('hex') !== manifest.sha256) throw new Error('APK alterado durante preparação.')
    writeFileSync(join(staging, 'release.json'), JSON.stringify(manifest, null, 2) + '\n')
    renameSync(join(staging, APK_NAME), join(directory, APK_NAME))
    renameSync(join(staging, 'release.json'), join(directory, 'release.json'))
  } finally { rmSync(staging, { recursive: true, force: true }) }
  return manifest
}
