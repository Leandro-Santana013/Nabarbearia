import type { ClientAppointment } from "@/pages/MyAppointments.types"
import { shopClock } from './shop-calendar'

export function splitAppointments(appointments: ClientAppointment[], now = new Date()) {
  const local = shopClock(now)
  const current = `${local.date}T${local.time}`
  const upcoming = appointments.filter((appointment) => appointment.status === 'confirmed' && `${appointment.date}T${appointment.time}` >= current)
  const upcomingIds = new Set(upcoming.map((appointment) => appointment.id))
  const byDate = (a: ClientAppointment, b: ClientAppointment) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)
  return {
    upcoming: upcoming.sort(byDate),
    history: appointments.filter((appointment) => !upcomingIds.has(appointment.id)).sort((a, b) => byDate(b, a)),
  }
}
