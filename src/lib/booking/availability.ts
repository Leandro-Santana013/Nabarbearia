import { getBusinessHours } from '../../data/barbershopData'
import type { AvailabilitySlot } from '../../services/api'
import { hasStarted, shopClock, shopDates, timePeriod, weekdayOfDate } from '../shop-calendar'

export interface DayOption { date: string; closed: boolean }
export interface BookingSlot { time: string; period: string; disabled: boolean; startsAt?: string; barberId?: string }
export interface RealBookingSlot extends BookingSlot { startsAt: string; barberId: string }

export function getDateOptions(now = new Date(), count = 14, operational = false): DayOption[] {
  return shopDates(now, count).map((date) => ({ date, closed: !operational && Boolean(getBusinessHours(weekdayOfDate(date)).closed) }))
}

export function getTimeSlots(date: string, now = new Date(), durationMinutes = 60): BookingSlot[] {
  if (!date || !Number.isInteger(durationMinutes) || durationMinutes <= 0) return []
  const hours = getBusinessHours(weekdayOfDate(date))
  if (hours.closed || !hours.open || !hours.close) return []
  const minutes = (time: string) => { const [hour, minute] = time.split(':').map(Number); return hour * 60 + minute }
  const slots: BookingSlot[] = []
  for (let minute = minutes(hours.open); minute + durationMinutes <= minutes(hours.close); minute += 30) {
    const time = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
    slots.push({ time, period: timePeriod(time), disabled: hasStarted(date, time, now) })
  }
  return slots
}

export function availabilityFromApi(slots: AvailabilitySlot[], date: string, now = new Date()): RealBookingSlot[] {
  const unique = new Map<string, RealBookingSlot>()
  for (const slot of slots) {
    const start = new Date(slot.starts_at)
    const end = new Date(slot.ends_at)
    if (!slot.barber_id || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) continue
    const local = shopClock(start)
    if (local.date !== date) continue
    const disabled = start.getTime() <= now.getTime()
    // Preserve a concrete professional; prefer a future candidate if a stale one shares its label.
    if (!unique.has(local.time) || (unique.get(local.time)!.disabled && !disabled)) unique.set(local.time, {
      time: local.time, period: timePeriod(local.time), disabled, startsAt: slot.starts_at, barberId: slot.barber_id,
    })
  }
  return [...unique.values()].sort((left, right) => left.time.localeCompare(right.time))
}

export interface AvailabilitySource {
  kind: 'real' | 'demo'
  days(now: Date): DayOption[]
  load(date: string): Promise<AvailabilitySlot[]>
  slots(raw: AvailabilitySlot[], date: string, now: Date): BookingSlot[]
}

export function realAvailability(load: AvailabilitySource['load']): AvailabilitySource {
  return { kind: 'real', days: (now) => getDateOptions(now, 14, true), load, slots: availabilityFromApi }
}

export function demoAvailability(durationMinutes: number): AvailabilitySource {
  return { kind: 'demo', days: (now) => getDateOptions(now), load: async () => [], slots: (_raw, date, now) => getTimeSlots(date, now, durationMinutes) }
}
