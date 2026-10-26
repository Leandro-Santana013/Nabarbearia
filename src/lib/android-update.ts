export const ANDROID_RELEASE_URL = '/api/v1/staff/android/release'
export const ANDROID_APK_URL = '/api/v1/staff/android/apk'

export interface AndroidRelease {
  version_code: number
  version_name: string
  size_bytes: number
  sha256: string
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
  const response = await fetch(ANDROID_RELEASE_URL, { cache: 'no-store', signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
  if (response.status === 204) return null
  if (!response.ok) throw new Error('Não foi possível verificar a atualização.')
  const release: AndroidRelease = await response.json()
  if (!Number.isSafeInteger(release.version_code) || release.version_code <= 0 ||
      typeof release.version_name !== 'string' || !release.version_name ||
      !Number.isSafeInteger(release.size_bytes) || release.size_bytes <= 0 ||
      !/^[a-f0-9]{64}$/.test(release.sha256)) throw new Error('Versão de atualização inválida.')
  return release.version_code > installed ? release : null
}
