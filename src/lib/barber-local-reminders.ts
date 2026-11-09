import { invoke } from '@tauri-apps/api/core'
import {
  cancel,
  createChannel,
  Importance,
  isPermissionGranted,
  requestPermission,
  Schedule,
  Visibility,
} from '@tauri-apps/plugin-notification'
import type { Appointment } from '../types'

const CHANNEL_ID = 'barber-appointments'
const NOTIFICATION_TITLE = 'Atendimento em 1 hora'
const STORAGE_PREFIX = 'na-barbearia:barber-reminders:'
const REMINDER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
let reminderUpdate = Promise.resolve()

const androidAppVersion = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
  ? navigator.userAgent.match(/\bNABarbearia(?:Debug)?\/(\d+)\b/)?.[1]
  : undefined

// The Android shell gained the native notification bridge in version 0.2.5.
export const supportsBarberLocalReminders = Number(androidAppVersion) >= 2005

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`
}

function loadIds(userId: string): number[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey(userId)) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is number => Number.isInteger(id)) : []
  } catch {
    return []
  }
}

function notificationId(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
  }
  return (hash & 0x7fffffff) || 1
}

async function prepareChannel() {
  await createChannel({
    id: CHANNEL_ID,
    name: 'Lembretes da agenda',
    description: 'Avisos locais dos atendimentos do barbeiro',
    importance: Importance.High,
    visibility: Visibility.Private,
    vibration: true,
  })
}

export async function enableBarberLocalReminders(): Promise<boolean> {
  if (!supportsBarberLocalReminders) return false
  let granted = await isPermissionGranted()
  if (!granted) granted = (await requestPermission()) === 'granted'
  if (!granted) return false
  await prepareChannel()
  return true
}

function queueReminderUpdate(update: () => Promise<void>) {
  const result = reminderUpdate.then(update)
  reminderUpdate = result.catch(() => {})
  return result
}

export function syncBarberLocalReminders(userId: string, appointments: Appointment[]) {
  return queueReminderUpdate(() => replaceBarberLocalReminders(userId, appointments))
}

async function replaceBarberLocalReminders(
  userId: string,
  appointments: Appointment[],
): Promise<void> {
  if (!supportsBarberLocalReminders) return

  const now = Date.now()
  const cutoff = now + REMINDER_WINDOW_MS
  const reminders = appointments.flatMap((appointment) => {
    if (appointment.barberId !== userId || appointment.status !== 'confirmed' || !appointment.startsAt) return []
    const startsAt = new Date(appointment.startsAt).getTime()
    const notifyAt = startsAt - 60 * 60 * 1000
    if (!Number.isFinite(startsAt) || notifyAt <= now || notifyAt > cutoff) return []
    return [{ appointment, notifyAt, id: notificationId(`${userId}:${appointment.id}`) }]
  })

  const previousIds = loadIds(userId)
  const nextIds = reminders.map(({ id }) => id)
  const nextSet = new Set(nextIds)
  const obsoleteIds = previousIds.filter((id) => !nextSet.has(id))
  if (obsoleteIds.length) await cancel(obsoleteIds)

  if (reminders.length && !(await isPermissionGranted())) {
    throw new Error('Permita notificações da NA Barbearia nas configurações do Android.')
  }

  localStorage.setItem(storageKey(userId), JSON.stringify(nextIds))
  await prepareChannel()
  for (const { appointment, notifyAt, id } of reminders) {
    if (notifyAt <= Date.now()) continue
    const time = new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    }).format(new Date(appointment.startsAt!))
    await invoke('plugin:notification|notify', { options: {
      id,
      title: NOTIFICATION_TITLE,
      body: `${appointment.clientName.trim() || 'Cliente'} · ${time} · ${appointment.serviceName ?? 'Atendimento'}`,
      icon: 'ic_stat_na_barbearia',
      channelId: CHANNEL_ID,
      schedule: Schedule.at(new Date(notifyAt), false, true),
    } })
  }
}

export function disableBarberLocalReminders(userId: string) {
  return queueReminderUpdate(async () => {
    if (!supportsBarberLocalReminders) return
    const ids = loadIds(userId)
    if (ids.length) await cancel(ids)
    localStorage.removeItem(storageKey(userId))
  })
}
