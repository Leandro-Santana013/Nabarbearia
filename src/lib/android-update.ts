export const ANDROID_RELEASE_URL = '/api/v1/staff/android/release'
export const ANDROID_APK_URL = '/api/v1/staff/android/apk'

export interface AndroidRelease {
  version_code: number
  version_name: string
  size_bytes: number
  sha256: string
}

export function parseAndroidRelease(value: unknown): AndroidRelease {
  const release = value as AndroidRelease | null
  if (!release || typeof release !== 'object' || Array.isArray(release) ||
      !Number.isInteger(release.version_code) || release.version_code <= 0 || release.version_code > 2147483647 ||
      typeof release.version_name !== 'string' || !release.version_name.trim() ||
      !Number.isSafeInteger(release.size_bytes) || release.size_bytes <= 0 ||
      typeof release.sha256 !== 'string' || release.sha256.length !== 64 || !/^[a-f0-9]{64}$/.test(release.sha256)) throw new Error('Versão de atualização inválida.')
  return { version_code: release.version_code, version_name: release.version_name, size_bytes: release.size_bytes, sha256: release.sha256 }
}

export function installedAndroidVersion(userAgent: string): number | null {
  if (userAgent.includes('NABarbeariaDebug/')) return null
  const match = /\bNABarbearia\/(\d+)\b/.exec(userAgent)
  if (match) return Number(match[1])
  // Releases before the updater used the stock Android WebView user agent.
  return /Android/.test(userAgent) && /; wv\)/.test(userAgent) ? 0 : null
}

export async function availableAndroidUpdate(installed: number, signal?: AbortSignal): Promise<AndroidRelease | null> {
  const timeout = AbortSignal.timeout(15000)
  let response: Response
  try {
    response = await fetch(ANDROID_RELEASE_URL, { cache: 'no-store', signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new Error('Não foi possível verificar a atualização. Verifique sua conexão e tente novamente.')
  }
  if (response.status === 204) return null
  if (!response.ok) throw new Error('Não foi possível verificar a atualização.')
  if (response.status !== 200 || response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new Error('A atualização está indisponível no servidor. Tente novamente mais tarde.')
  }
  const release = parseAndroidRelease(await response.json().catch(() => null))
  return release.version_code > installed ? release : null
}
