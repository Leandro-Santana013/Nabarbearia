import type { ClientAppointment } from "@/pages/MyAppointments.types"

export function splitAppointments(appointments: ClientAppointment[], now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)!.value
  const current = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
  const upcoming = appointments.filter((appointment) => appointment.status === 'confirmed' && `${appointment.date}T${appointment.time}` >= current)
  const upcomingIds = new Set(upcoming.map((appointment) => appointment.id))
  const byDate = (a: ClientAppointment, b: ClientAppointment) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)
  return {
    upcoming: upcoming.sort(byDate),
    history: appointments.filter((appointment) => !upcomingIds.has(appointment.id)).sort((a, b) => byDate(b, a)),
  }
}
