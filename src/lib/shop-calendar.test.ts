import { afterEach, expect, it, vi } from 'vitest'
import { formatShopDate, hasStarted, shopClock, shopDates, weekdayOfDate } from './shop-calendar'

afterEach(() => vi.unstubAllEnvs())
it('distingue instante UTC de data/horário da barbearia na meia-noite', () => {
  expect(shopClock(new Date('2027-01-01T01:30:00Z'))).toEqual({ date: '2026-12-31', time: '22:30' })
  expect(shopDates(new Date('2027-01-01T01:30:00Z'), 3)).toEqual(['2026-12-31', '2027-01-01', '2027-01-02'])
})
it.each(['Asia/Tokyo', 'America/Los_Angeles', 'UTC'])('não usa o fuso do navegador/processo: %s', (zone) => {
  vi.stubEnv('TZ', zone)
  expect(shopClock(new Date('2026-11-01T02:30:00Z'))).toEqual({ date: '2026-10-31', time: '23:30' })
  expect(weekdayOfDate('2026-11-01')).toBe(0)
  expect(formatShopDate('2026-11-01', { weekday: 'long' })).toBe('domingo')
})
it('revalida horário já iniciado e rejeita data impossível', () => {
  const now = new Date('2026-10-30T13:30:00Z')
  expect(hasStarted('2026-10-30', '10:30', now)).toBe(true)
  expect(hasStarted('2026-10-30', '11:00', now)).toBe(false)
  expect(() => weekdayOfDate('2026-02-30')).toThrow('Data inválida')
})
