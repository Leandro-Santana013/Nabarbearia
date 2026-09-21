import type {
  Appointment,
  AppointmentStatus,
  AvailabilityBlock,
  BookingInput,
} from '../types'

const activeStatuses: AppointmentStatus[] = ['confirmed', 'completed', 'no-show']

export const getAvailableSlots = (
  appointments: Appointment[],
  blocks: AvailabilityBlock[],
  barberId: string,
  date: string,
): string[] => {
  const allSlots = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00']
  const occupied = new Set(
    appointments
      .filter((appointment) => appointment.barberId === barberId && appointment.date === date && activeStatuses.includes(appointment.status))
      .map((appointment) => appointment.time),
  )
  const blocked = new Set(
    blocks.filter((block) => block.barberId === barberId && block.date === date).map((block) => block.time),
  )
  return allSlots.filter((slot) => !occupied.has(slot) && !blocked.has(slot))
}

export const createAppointment = (
  input: BookingInput,
  sequence: number,
): Appointment => ({
  id: `appointment-local-${sequence}`,
  clientName: input.clientName.trim(),
  serviceId: input.serviceId,
  barberId: input.barberId,
  date: input.date,
  time: input.time,
  status: 'confirmed',
  amountCents: input.amountCents ?? 0,
  source: 'demo',
})

export const rescheduleAppointment = (
  appointments: Appointment[],
  appointmentId: string,
  date: string,
  time: string,
): Appointment[] => appointments.map((appointment) => (
  appointment.id === appointmentId ? { ...appointment, date, time, status: 'confirmed' } : appointment
))

export const cancelAppointment = (
  appointments: Appointment[],
  appointmentId: string,
): Appointment[] => appointments.map((appointment) => (
  appointment.id === appointmentId ? { ...appointment, status: 'cancelled' } : appointment
))

export const updateAppointmentStatus = (
  appointments: Appointment[],
  appointmentId: string,
  status: AppointmentStatus,
): Appointment[] => appointments.map((appointment) => (
  appointment.id === appointmentId ? { ...appointment, status } : appointment
))

export interface ProfessionalMetrics {
  total: number
  confirmed: number
  completed: number
  noShow: number
  revenueCents: number
  commissionCents: number
}

export const calculateProfessionalMetrics = (
  appointments: Appointment[],
  barberId: string,
  commissionRate: number,
): ProfessionalMetrics => {
  const own = appointments.filter((appointment) => appointment.barberId === barberId && appointment.status !== 'cancelled')
  const completed = own.filter((appointment) => appointment.status === 'completed')
  return {
    total: own.length,
    confirmed: own.filter((appointment) => appointment.status === 'confirmed').length,
    completed: completed.length,
    noShow: own.filter((appointment) => appointment.status === 'no-show').length,
    revenueCents: completed.reduce((total, appointment) => total + appointment.amountCents, 0),
    commissionCents: Math.round(completed.reduce((total, appointment) => total + appointment.amountCents, 0) * commissionRate),
  }
}

export const calculateOwnerRevenue = (appointments: Appointment[]): number => appointments
  .filter((appointment) => appointment.status === 'completed')
  .reduce((total, appointment) => total + appointment.amountCents, 0)
