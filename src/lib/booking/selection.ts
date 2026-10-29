import { ApiError } from '../../services/api'
import { SHOP_TIME_ZONE } from '../shop-calendar'
import { clientError } from '../client-api'
import type { AvailabilitySlot } from '../../services/api'
import type { BookingReview, DateTimeChoice } from '../../pages/DateTimeSelection.types'
import type { Barber, ServiceInfo } from '../../pages/ServiceDetail.types'
import type { AvailabilitySource } from './availability'

export function createBookingSelection(source: AvailabilitySource, {
  service, barber, initialDate = '', initialTime = '', now = () => new Date(), onSelectionChange,
  onConfirm,
}: { service: ServiceInfo; barber: Barber; initialDate?: string; initialTime?: string; now?: () => Date;
  onSelectionChange?: (choice: DateTimeChoice) => void; onConfirm?: (review: BookingReview) => void | Promise<void> }) {
  const days = source.days(now())
  const date = days.find((day) => day.date === initialDate && !day.closed)?.date ?? days.find((day) => !day.closed)?.date ?? ''
  let state = { days, date, time: initialDate === date ? initialTime : '', loading: source.kind === 'real', slotError: '', confirming: false, confirmError: '' }
  let raw: AvailabilitySlot[] = []
  let revision = 0
  let pending = false
  const listeners = new Set<() => void>()
  const publish = (next: Partial<typeof state>) => { state = { ...state, ...next }; for (const listener of listeners) listener() }
  const slots = () => source.slots(raw, state.date, now())
  const choiceChanged = () => onSelectionChange?.({ date: state.date, time: state.time })
  async function reload() {
    if (source.kind === 'demo') return
    const request = ++revision
    const selectedDate = state.date
    raw = []
    publish({ loading: true, slotError: '' })
    try {
      const result = await source.load(selectedDate)
      if (request === revision) { raw = result; publish({ loading: false }) }
    } catch (error) {
      if (request === revision) publish({ loading: false, slotError: clientError(error) })
    }
  }
  function selectDate(next: string) {
    if (pending || next === state.date || !days.some((day) => day.date === next && !day.closed)) return
    publish({ date: next, time: '', confirmError: '' })
    choiceChanged()
    void reload()
  }
  function selectTime(time: string) {
    if (pending || state.loading || !slots().some((slot) => slot.time === time && !slot.disabled)) return
    publish({ time, confirmError: '' })
    choiceChanged()
  }
  function validate() {
    if (!state.loading && !state.slotError && slots().some((slot) => slot.time === state.time && !slot.disabled)) return true
    publish({ time: '' })
    choiceChanged()
    return false
  }
  function review(): BookingReview | null {
    if (!validate()) return null
    const slot = slots().find((item) => item.time === state.time)!
    return { service, barber, date: state.date, time: state.time, timeZone: SHOP_TIME_ZONE, startsAt: slot.startsAt, barberId: slot.barberId }
  }
  async function confirm() {
    if (pending) return
    const reviewed = review()
    if (!reviewed) return
    const request = revision
    pending = true
    publish({ confirming: true, confirmError: '' })
    try { await onConfirm?.(reviewed) }
    catch (error) {
      if (request !== revision) return
      publish({ confirmError: clientError(error) })
      // A lost response may already have created the reservation. Keep the same
      // selection available for an idempotent retry instead of hiding its slot.
      const ambiguous = error instanceof ApiError && ['NETWORK_ERROR', 'REQUEST_TIMEOUT'].includes(error.code)
      if (!ambiguous) await reload()
    } finally {
      pending = false
      if (request === revision || state.confirming) publish({ confirming: false })
    }
  }
  return {
    getSnapshot: () => state, slots, selectDate, selectTime, validate, review, confirm, reload,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    dispose() { revision += 1 },
  }
}
