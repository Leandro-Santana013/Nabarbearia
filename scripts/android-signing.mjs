import { randomBytes } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const android = fileURLToPath(new URL('../src-tauri/gen/android/', import.meta.url))
const properties = join(android, 'keystore.properties')
const keystore = join(android, 'nabarbearia-release.p12')
if (existsSync(properties) || existsSync(keystore)) {
  if (!existsSync(properties) || !existsSync(keystore)) {
    throw new Error('Assinatura incompleta. Restaure o keystore e keystore.properties do backup.')
  }
  console.info('Chave de assinatura existente preservada.')
} else {
  const studioJava = join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Android', 'Android Studio', 'jbr')
  const java = existsSync(studioJava) ? studioJava : process.env.JAVA_HOME
  const keytool = java ? join(java, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool') : 'keytool'
  const password = randomBytes(32).toString('hex')
  const result = spawnSync(keytool, [
    '-genkeypair', '-noprompt', '-storetype', 'PKCS12', '-keystore', keystore,
    '-alias', 'nabarbearia', '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000',
    '-dname', 'CN=NA Barbearia, O=NA Barbearia, C=BR',
    '-storepass:env', 'NABARBEARIA_KEY_PASSWORD', '-keypass:env', 'NABARBEARIA_KEY_PASSWORD',
  ], { env: { ...process.env, NABARBEARIA_KEY_PASSWORD: password }, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
  // Caminho relativo ao módulo app, sem problemas com acentos/escapes em Properties.
  writeFileSync(properties, `storeFile=../nabarbearia-release.p12\nkeyAlias=nabarbearia\npassword=${password}\n`, { flag: 'wx', mode: 0o600 })
  console.info('Chave criada. Guarde um backup privado de nabarbearia-release.p12 e keystore.properties.')
}
