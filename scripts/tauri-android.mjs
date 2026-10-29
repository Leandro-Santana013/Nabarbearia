import { existsSync, readdirSync } from 'node:fs'
import { prepareAndroidRelease } from './release/android-release.mjs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const env = { ...process.env }
if (process.argv[2] === 'build' && !process.argv.includes('--debug')) {
  if (env.NABARBEARIA_ANDROID_CERT_SHA256?.length !== 64 || !/^[a-f0-9]{64}$/.test(env.NABARBEARIA_ANDROID_CERT_SHA256)) throw new Error('Defina NABARBEARIA_ANDROID_CERT_SHA256 com o certificado aprovado antes do build release.')
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
    try {
      const sdk = env.ANDROID_HOME
      if (!sdk) throw new Error('Defina ANDROID_HOME para inspecionar o APK.')
      const version = readdirSync(join(sdk, 'build-tools')).filter(name => /^\d+(\.\d+)+$/.test(name))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1)
      if (!version) throw new Error('Android build-tools ausente.')
      const buildTools = join(sdk, 'build-tools', version)
      const directory = join(root, 'artifacts')
      const release = prepareAndroidRelease({
        apk: join(root, 'src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk'),
        properties: join(root, 'src-tauri/gen/android/app/tauri.properties'), directory,
        expectedCertificate: env.NABARBEARIA_ANDROID_CERT_SHA256,
        tools: { aapt: join(buildTools, process.platform === 'win32' ? 'aapt.exe' : 'aapt'),
          apksigner: join(buildTools, 'lib/apksigner.jar'),
          java: env.JAVA_HOME ? join(env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java' },
      })
      console.info(`Entrega Android preparada: ${release.version_name} (${release.version_code}) em ${directory}`)
    } catch (error) {
      console.error(error.message)
      process.exitCode = 1
    }
  }
})
