import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const env = { ...process.env }
if (process.argv[2] === 'build' && !process.argv.includes('--debug')) {
  for (const name of ['nabarbearia-release.p12', 'keystore.properties']) {
    if (!existsSync(join(root, 'src-tauri/gen/android', name))) {
      throw new Error(`Assinatura ausente: ${name}. Restaure o backup para atualizar o app existente. Para uma primeira instalação nova, execute android:signing explicitamente.`)
    }
  }
}
delete env.DEBUG
const gradleCache = join(tmpdir(), 'nabarbearia-android-gradle-cache').replaceAll('\\', '/')
env.GRADLE_OPTS = [env.GRADLE_OPTS, `"-Dorg.gradle.projectcachedir=${gradleCache}"`].filter(Boolean).join(' ')
if (process.platform === 'win32') {
  // Toolchain isolado para Android; não altera o toolchain padrão do backend.
  env.RUSTUP_TOOLCHAIN ??= 'stable-x86_64-pc-windows-gnu'
  // MinGW não lida corretamente com os acentos do caminho deste checkout.
  env.CARGO_TARGET_DIR ??= join(tmpdir(), 'nabarbearia-android-target')
  env.ANDROID_HOME ??= join(env.LOCALAPPDATA, 'Android', 'Sdk')
  const studioJava = join(env.ProgramFiles ?? 'C:\\Program Files', 'Android', 'Android Studio', 'jbr')
  if (existsSync(studioJava)) env.JAVA_HOME = studioJava
  const ndkRoot = join(env.ANDROID_HOME, 'ndk')
  if (!env.NDK_HOME && existsSync(ndkRoot)) {
    const versions = readdirSync(ndkRoot).filter((name) => /^\d+(\.\d+)+$/.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    if (versions.length) env.NDK_HOME = join(ndkRoot, versions.at(-1))
  }
}

const args = [
  join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'),
  'android', ...process.argv.slice(2),
]
const child = spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit' })
child.on('error', (error) => {
  console.error(error.message)
  process.exitCode = 1
})
child.on('exit', (code) => {
  process.exitCode = code ?? 1
  if (code === 0 && process.argv[2] === 'build' && !process.argv.includes('--debug')) {
    const apk = join(root, 'src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk')
    if (!existsSync(apk)) return
    const artifacts = join(root, 'artifacts')
    mkdirSync(artifacts, { recursive: true })
    const delivery = join(artifacts, 'NA-Barbearia-arm64-release.apk')
    copyFileSync(apk, delivery)
    const properties = readFileSync(join(root, 'src-tauri/gen/android/app/tauri.properties'), 'utf8')
    const versionCode = Number(properties.match(/^tauri.android.versionCode=(\d+)$/m)?.[1])
    const versionName = properties.match(/^tauri.android.versionName=(.+)$/m)?.[1]?.trim()
    if (!Number.isSafeInteger(versionCode) || versionCode <= 0 || !versionName) {
      throw new Error('Não foi possível obter a versão do APK compilado.')
    }
    writeFileSync(join(artifacts, 'release.json'), JSON.stringify({
      version_code: versionCode,
      version_name: versionName,
      size_bytes: statSync(delivery).size,
      sha256: createHash('sha256').update(readFileSync(delivery)).digest('hex'),
    }, null, 2) + '\n')
    console.info(`APK de entrega: ${delivery}`)
  }
})
