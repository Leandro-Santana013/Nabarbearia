import { describe, expect, it } from 'vitest'
import { calculateProfessionalMetrics, cancelAppointment, createAppointment, getAvailableSlots, rescheduleAppointment, updateAppointmentStatus } from './booking'
import type { Appointment } from '../types'

const appointment: Appointment = {
  id: 'a-1',
  clientName: 'Demo',
  serviceId: 'service-cut',
  barberId: 'barber-a',
  date: '2026-09-22',
  time: '09:00',
  status: 'confirmed',
  amountCents: 4500,
  source: 'demo',
}

describe('booking domain', () => {
  it('creates a confirmed local appointment', () => {
    expect(createAppointment({ ...appointment, id: undefined } as never, 7)).toMatchObject({
      id: 'appointment-local-7',
      status: 'confirmed',
      source: 'demo',
    })
  })

  it('does not offer occupied or blocked slots', () => {
    const slots = getAvailableSlots(
      [appointment],
      [{ id: 'b-1', barberId: 'barber-a', date: '2026-09-22', time: '13:00', reason: 'demo', demoOnly: true }],
      'barber-a',
      '2026-09-22',
    )
    expect(slots).not.toContain('09:00')
    expect(slots).not.toContain('13:00')
    expect(slots).toContain('10:00')
  })

  it('reschedules and cancels without mutating the original list', () => {
    const rescheduled = rescheduleAppointment([appointment], 'a-1', '2026-09-23', '14:00')
    expect(rescheduled[0]).toMatchObject({ date: '2026-09-23', time: '14:00' })
    expect(appointment.date).toBe('2026-09-22')
    expect(cancelAppointment(rescheduled, 'a-1')[0].status).toBe('cancelled')
  })

  it('calculates commission only from completed appointments', () => {
    const result = calculateProfessionalMetrics([
      appointment,
      { ...appointment, id: 'a-2', status: 'completed', amountCents: 3000 },
      { ...appointment, id: 'a-3', status: 'no-show' },
    ], 'barber-a', 0.4)
    expect(result.completed).toBe(1)
    expect(result.revenueCents).toBe(3000)
    expect(result.commissionCents).toBe(1200)
    expect(updateAppointmentStatus([appointment], 'a-1', 'completed')[0].status).toBe('completed')
  })
})
