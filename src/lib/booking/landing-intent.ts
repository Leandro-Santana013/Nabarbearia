export interface LandingSelection { serviceId?: string; barberId?: string }
export interface LandingIntent extends LandingSelection {
  version: 1
  createdAt: number
  ownerUserId: string | null
}

export const LANDING_INTENT_KEY = 'na:landing-booking-intent:v1'
export const LANDING_INTENT_TTL = 30 * 60 * 1000

type IntentStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const validId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 128 && value.trim() === value && !/[\u0000-\u001f\u007f-\u009f]/.test(value)
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const browserStorage = (): IntentStorage | null => typeof window === 'undefined' ? null : window.sessionStorage

// Only a preference survives reloads: prices, dates, availability and destinations
// always come from the current client flow, never from this storage record.
export function createLandingIntentStore({ storage = browserStorage, now = Date.now }: {
  storage?: () => IntentStorage | null
  now?: () => number
} = {}) {
  let memory: LandingIntent | null = null
  let preferMemory = false

  function clearLandingIntent() {
    memory = null
    preferMemory = false
    try {
      const target = storage()
      if (target) target.removeItem(LANDING_INTENT_KEY)
      else preferMemory = true
    } catch { preferMemory = true }
  }

  function validIntent(value: unknown): value is LandingIntent {
    if (!isRecord(value) || Object.keys(value).some((key) => !['version', 'createdAt', 'ownerUserId', 'serviceId', 'barberId'].includes(key))) return false
    if (value.version !== 1 || !Number.isSafeInteger(value.createdAt) || typeof value.createdAt !== 'number' || value.createdAt < 0 || value.createdAt > now() || now() - value.createdAt >= LANDING_INTENT_TTL) return false
    if (value.ownerUserId !== null && !validId(value.ownerUserId)) return false
    if ('serviceId' in value && !validId(value.serviceId)) return false
    if ('barberId' in value && !validId(value.barberId)) return false
    return validId(value.serviceId) || validId(value.barberId)
  }

  function persist(value: LandingIntent) {
    memory = { ...value }
    preferMemory = false
    try {
      const target = storage()
      if (target) target.setItem(LANDING_INTENT_KEY, JSON.stringify(value))
      else preferMemory = true
    } catch {
      preferMemory = true
      // A failed replacement must not leave an older preference for a reload.
      try { storage()?.removeItem(LANDING_INTENT_KEY) } catch { /* storage is unavailable */ }
    }
    return { ...value }
  }

  function readLandingIntent(): LandingIntent | null {
    let candidate: unknown = memory
    if (!preferMemory) {
      try {
        const target = storage()
        if (target) {
          const raw = target.getItem(LANDING_INTENT_KEY)
          try { candidate = raw === null ? null : JSON.parse(raw) }
          catch { candidate = null }
        }
      } catch { candidate = memory }
    }
    if (!validIntent(candidate)) { clearLandingIntent(); return null }
    memory = { ...candidate }
    return { ...candidate }
  }

  function saveLandingIntent(selection: LandingSelection, ownerUserId: string | null): LandingIntent | null {
    if (!isRecord(selection) || Object.keys(selection).some((key) => !['serviceId', 'barberId'].includes(key))) { clearLandingIntent(); return null }
    const value = { ...selection, version: 1 as const, createdAt: now(), ownerUserId }
    if (!validIntent(value)) { clearLandingIntent(); return null }
    return persist(value)
  }

  function claimLandingIntent(userId: string): LandingIntent | null {
    const value = readLandingIntent()
    if (!validId(userId) || !value || (value.ownerUserId !== null && value.ownerUserId !== userId)) { clearLandingIntent(); return null }
    return value.ownerUserId === userId ? value : persist({ ...value, ownerUserId: userId })
  }

  return { saveLandingIntent, readLandingIntent, clearLandingIntent, claimLandingIntent }
}

export const { saveLandingIntent, readLandingIntent, clearLandingIntent, claimLandingIntent } = createLandingIntentStore()
