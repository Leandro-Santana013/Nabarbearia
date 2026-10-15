import { describe, expect, it } from 'vitest'
import { getDateOptions, getTimeSlots } from './DateTimeSelection.jsx'

describe('horários conforme o expediente', () => {
  it('usa o dia de São Paulo mesmo após a meia-noite UTC', () => {
    const days = getDateOptions(new Date('2026-10-16T01:30:00Z'))
    expect(days).toHaveLength(14)
    expect(days[0].date).toBe('2026-10-15')
    expect(days.find((day) => day.date === '2026-10-18')?.closed).toBe(true)
  })

  it('gera dias consecutivos na virada do ano', () => {
    const days = getDateOptions(new Date('2026-12-31T15:00:00Z'), 3)
    expect(days.map((day) => day.date)).toEqual(['2026-12-31', '2027-01-01', '2027-01-02'])
  })

  it('bloqueia domingos e datas passadas', () => {
    const now = new Date('2026-10-15T13:40:00Z')
    expect(getTimeSlots('2026-10-18', now).every((slot) => slot.disabled)).toBe(true)
    expect(getTimeSlots('2026-10-14', now).every((slot) => slot.disabled)).toBe(true)
  })

  it('bloqueia horários que já começaram, mantendo horários futuros disponíveis', () => {
    const slots = getTimeSlots('2026-10-15', new Date('2026-10-15T13:30:00Z'))
    expect(slots.find((slot) => slot.time === '10:30')?.disabled).toBe(true)
    expect(slots.find((slot) => slot.time === '11:00')?.disabled).toBe(false)
  })

  it('separa os períodos sem inventar horários ocupados', () => {
    const slots = getTimeSlots('2026-10-16', new Date('2026-10-15T13:30:00Z'))
    expect(slots.find((slot) => slot.time === '10:00')?.period).toBe('morning')
    expect(slots.find((slot) => slot.time === '14:00')?.period).toBe('afternoon')
    expect(slots.find((slot) => slot.time === '18:00')?.period).toBe('evening')
    expect(slots.some((slot) => slot.disabled)).toBe(false)
    expect(slots.some((slot) => !slot.disabled)).toBe(true)
  })
  it('respeita a duração do serviço e o fechamento de sábado', () => {
    const slots = getTimeSlots('2026-10-17', new Date('2026-10-15T13:30:00Z'), 80)
    expect(slots[0].time).toBe('10:00')
    expect(slots[slots.length - 1]?.time).toBe('17:30')
    expect(slots.some((slot) => slot.time === '18:00')).toBe(false)
  })

})
