import type { Appointment } from '@/types'

export function shopDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
export function isAppointmentInProgress(item: Appointment, startedIds: ReadonlySet<string> = new Set()) {
  return item.status === 'confirmed' && (item.executionStarted === true || startedIds.has(item.id))
}

export function sortBarberAppointments(appointments: Appointment[], startedIds: ReadonlySet<string> = new Set()) {
  const priority = (item: Appointment) => isAppointmentInProgress(item, startedIds) ? 0
    : item.status === 'confirmed' ? 1 : item.status === 'completed' ? 2 : item.status === 'no-show' ? 3 : 4
  return [...appointments].sort((a, b) => priority(a) - priority(b)
    || (a.startsAt ?? a.date).localeCompare(b.startsAt ?? b.date)
    || a.id.localeCompare(b.id))
}

export function dailySchedule(appointments: Appointment[], barberId: string, date: string) {
  const items = sortBarberAppointments(appointments.filter((item) => item.barberId === barberId && shopDate(new Date(item.startsAt ?? item.date)) === date))
  const completed = items.filter((item) => item.status === 'completed')
  return {
    items,
    completed: completed.length,
    total: items.filter((item) => item.status !== 'cancelled' && item.status !== 'no-show').length,
    commissionCents: completed.reduce((total, item) => total + (item.commissionCents ?? 0), 0),
    commissionPending: completed.filter((item) => item.commissionCents === undefined).length,
    amountCents: completed.reduce((total, item) => total + item.amountCents, 0),
  }
}
export const money = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
export const scheduleTime = (date: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(date))
