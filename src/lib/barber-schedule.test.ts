import { describe, expect, it } from 'vitest'
import { dailySchedule, shopDate, scheduleTime, sortBarberAppointments } from './barber-schedule'
import type { Appointment } from '@/types'

const appointment = (id: string, startsAt: string, overrides: Partial<Appointment> = {}): Appointment => ({
  id, startsAt, date: startsAt, time: startsAt, barberId: 'barber-1', clientName: 'Cliente', serviceId: 'corte-cabelo',
  status: 'confirmed', amountCents: 4500, ...overrides,
})

describe('agenda do barbeiro', () => {
  it('considera o dia e o horário de São Paulo na virada de dia UTC', () => {
    expect(shopDate(new Date('2026-10-16T01:00:00Z'))).toBe('2026-10-15')
    expect(scheduleTime('2026-10-16T01:00:00Z')).toBe('22:00')
  })
  it('filtra somente a agenda do profissional e ordena os atendimentos', () => {
    const items = [
      appointment('last', '2026-10-15T18:00:00Z'), appointment('other-barber', '2026-10-15T14:00:00Z', { barberId: 'barber-2' }),
      appointment('first', '2026-10-15T13:00:00Z'), appointment('tomorrow', '2026-10-16T13:00:00Z'),
    ]
    expect(dailySchedule(items, 'barber-1', '2026-10-15').items.map((item) => item.id)).toEqual(['first', 'last'])
    expect(items[0].id).toBe('last')
  })
  it('prioriza atendimento em andamento, horários agendados e depois encerrados sem alterar a entrada', () => {
    const items = [
      appointment('completed', '2026-10-15T12:00:00Z', { status: 'completed', executionStarted: true }),
      appointment('late', '2026-10-15T18:00:00Z'),
      appointment('cancelled', '2026-10-15T11:00:00Z', { status: 'cancelled' }),
      appointment('early', '2026-10-15T15:30:00Z'),
      appointment('started', '2026-10-15T16:00:00Z', { executionStarted: true }),
      appointment('absent', '2026-10-15T14:00:00Z', { status: 'no-show' }),
    ]
    const original = items.map((item) => item.id)
    expect(sortBarberAppointments(items).map((item) => item.id)).toEqual(['started', 'early', 'late', 'completed', 'absent', 'cancelled'])
    expect(items.map((item) => item.id)).toEqual(original)
    expect(dailySchedule(items, 'barber-1', '2026-10-15').items[0].id).toBe('started')
  })
  it('considera o início local imediatamente e ignora IDs iniciados de atendimentos encerrados', () => {
    const items = [
      appointment('early', '2026-10-15T13:00:00Z'),
      appointment('local', '2026-10-15T18:00:00Z'),
      appointment('done', '2026-10-15T12:00:00Z', { status: 'completed' }),
    ]
    expect(sortBarberAppointments(items, new Set(['local', 'done'])).map((item) => item.id)).toEqual(['local', 'early', 'done'])
  })
  it('soma comissões persistidas e identifica configurações pendentes', () => {
    const result = dailySchedule([
      appointment('calculated', '2026-10-15T13:00:00Z', { status: 'completed', commissionCents: 2700 }),
      appointment('zero', '2026-10-15T14:00:00Z', { status: 'completed', commissionCents: 0 }),
      appointment('pending', '2026-10-15T15:00:00Z', { status: 'completed' }),
      appointment('future', '2026-10-15T16:00:00Z'),
    ], 'barber-1', '2026-10-15')
    expect(result.commissionCents).toBe(2700)
    expect(result.commissionPending).toBe(1)
  })
  it('soma somente valores concluídos e exclui cancelamentos e faltas do total', () => {
    const result = dailySchedule([
      appointment('completed', '2026-10-15T13:00:00Z', { status: 'completed', amountCents: 10000 }),
      appointment('pending', '2026-10-15T14:00:00Z'),
      appointment('cancelled', '2026-10-15T15:00:00Z', { status: 'cancelled' }),
      appointment('absent', '2026-10-15T16:00:00Z', { status: 'no-show' }),
    ], 'barber-1', '2026-10-15')
    expect(result).toMatchObject({ total: 2, completed: 1, amountCents: 10000 })
    expect(dailySchedule([], 'barber-1', '2026-10-15')).toMatchObject({ total: 0, completed: 0, amountCents: 0 })
  })
})
