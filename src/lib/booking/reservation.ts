import type { Appointment, Barber as ApiBarber, Service } from '../../types'
import type { AvailabilitySlot } from '../../services/api'
import type { Barber, ServiceInfo } from '../../pages/ServiceDetail.types'
import type { BookingReview, DateTimeChoice } from '../../pages/DateTimeSelection.types'
import { SHOP_TIME_ZONE, shopClock } from '../shop-calendar'

export class BookingError extends Error {}
export const displayCategory = (category: string) => category.toLowerCase() === 'combos' ? 'Combos' : category === 'Remoção com Cera Quente' ? 'Cera Quente' : category || 'Outros'
export const ANY_BARBER: Barber = { id: 'any', name: 'Qualquer disponível', specialty: 'Barbeiro(a)', isAny: true }

export interface BookingService {
  id: string
  title: string
  category: string
  description: string
  priceCents: number
  durationMinutes: number
}
type BookingMode = { kind: 'create' } | { kind: 'reschedule'; appointmentId: string }
export interface BookingDraft { service: BookingService; barber: Barber; mode: BookingMode }
interface ReservationState { draft: BookingDraft | null; choice: DateTimeChoice; confirming: boolean }
interface ReservationGateway {
  getAvailability(serviceId: string, date: string, barberId?: string): Promise<AvailabilitySlot[]>
  bookAppointment(input: { barber_user_id: string; service_id: string; starts_at: string }, key: string): Promise<Appointment>
  rescheduleAppointment(id: string, startsAt: string): Promise<Appointment>
}

function validatedService(service: BookingService): BookingService {
  if (!service.id || !Number.isSafeInteger(service.priceCents) || service.priceCents < 0 || !Number.isSafeInteger(service.durationMinutes) || service.durationMinutes <= 0) throw new BookingError('Este serviço não possui os dados necessários para reservar. Atualize o catálogo.')
  return service
}
export function serviceForDisplay(service: BookingService): ServiceInfo {
  return { id: service.id, title: service.title, category: displayCategory(service.category), description: service.description,
    price: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(service.priceCents / 100),
    priceAmount: service.priceCents / 100, duration: `${service.durationMinutes} min`, durationMinutes: service.durationMinutes }
}

export function createReservation(gateway: ReservationGateway, getUserId: () => string | null, { now = () => new Date(), key = () => crypto.randomUUID() }: { now?: () => Date; key?: () => string } = {}) {
  let state: ReservationState = { draft: null, choice: { date: '', time: '' }, confirming: false }
  let catalog: Service[] = []
  let professionals: ApiBarber[] = []
  let revision = 0
  let idempotency: { fingerprint: string; key: string } | null = null
  let pending: { fingerprint: string; task: Promise<Appointment> } | null = null
  const listeners = new Set<() => void>()
  const publish = (next: Partial<ReservationState>) => { state = { ...state, ...next }; for (const listener of listeners) listener() }
  const findService = (id?: string) => {
    const service = catalog.find((item) => item.id === id && item.active !== false)
    if (!service) throw new BookingError('Este serviço não está mais disponível no catálogo. Escolha outro serviço.')
    return service
  }
  const professional = (id: string): Barber => {
    if (id === ANY_BARBER.id) return ANY_BARBER
    const value = professionals.find((item) => item.id === id && item.active !== false)
    if (!value) throw new BookingError('Este profissional não está disponível. Escolha outro profissional.')
    return { id: value.id, name: value.name, specialty: value.specialty ?? 'Barbeiro(a)', avatar: value.photoUrl }
  }
  function setDraft(draft: BookingDraft, choice = { date: '', time: '' }) {
    revision += 1
    idempotency = null
    publish({ draft, choice })
  }
  function start(serviceId: string) {
    const source = findService(serviceId)
    setDraft({ service: validatedService({ id: source.id, title: source.name, category: source.category ?? '', description: source.description ?? '', priceCents: source.priceCents, durationMinutes: source.durationMinutes }), barber: ANY_BARBER, mode: { kind: 'create' } })
  }
  function reuse(appointment: Appointment, reschedule = false) {
    const source = findService(appointment.serviceId)
    const available = professionals.some((item) => item.id === appointment.barberId && item.active !== false)
    if (reschedule && !available) throw new BookingError('Este profissional não está disponível para remarcação. Fale com a recepção.')
    const service = reschedule
      ? validatedService({ id: source.id, title: appointment.serviceName ?? source.name, category: source.category ?? '', description: source.description ?? '', priceCents: appointment.amountCents, durationMinutes: appointment.durationMinutes! })
      : validatedService({ id: source.id, title: source.name, category: source.category ?? '', description: source.description ?? '', priceCents: source.priceCents, durationMinutes: source.durationMinutes })
    setDraft({ service, barber: available ? professional(appointment.barberId) : ANY_BARBER, mode: reschedule ? { kind: 'reschedule', appointmentId: appointment.id } : { kind: 'create' } }, { date: reschedule ? shopClock(new Date(appointment.startsAt ?? appointment.date)).date : '', time: '' })
  }
  function selectProfessional(id: string) {
    if (!state.draft) throw new BookingError('Escolha um serviço para continuar.')
    setDraft({ ...state.draft, barber: professional(id) })
  }
  async function loadAvailability(date: string) {
    const draft = state.draft
    if (!draft) return []
    findService(draft.service.id)
    return gateway.getAvailability(draft.service.id, date, draft.barber.isAny ? undefined : draft.barber.id)
  }
  function confirm(review: BookingReview): Promise<Appointment> {
    const draft = state.draft
    const userId = getUserId()
    if (!draft || !userId) throw new BookingError('Entre na sua conta para confirmar a reserva.')
    findService(draft.service.id)
    const start = new Date(review.startsAt ?? '')
    if (!review.barberId || review.barberId === ANY_BARBER.id || !Number.isFinite(start.getTime()) || review.service.id !== draft.service.id || review.timeZone !== SHOP_TIME_ZONE) throw new BookingError('Escolha um horário válido para continuar.')
    const selected = professional(review.barberId)
    const local = shopClock(start)
    if ((!draft.barber.isAny && selected.id !== draft.barber.id) || local.date !== review.date || local.time !== review.time) throw new BookingError('O horário ou profissional mudou. Revise a reserva novamente.')
    const startsAt = start.toISOString()
    const fingerprint = JSON.stringify([userId, draft.service.id, selected.id, startsAt, draft.mode])
    if (pending) {
      if (pending.fingerprint === fingerprint) return pending.task
      throw new BookingError('Aguarde a confirmação da reserva atual.')
    }
    if (start.getTime() <= now().getTime()) throw new BookingError('Este horário já começou. Escolha outro horário.')
    if (idempotency?.fingerprint !== fingerprint) idempotency = { fingerprint, key: key() }
    const request = revision
    publish({ confirming: true })
    const operation = draft.mode.kind === 'reschedule'
      ? gateway.rescheduleAppointment(draft.mode.appointmentId, startsAt)
      : gateway.bookAppointment({ barber_user_id: selected.id, service_id: draft.service.id, starts_at: startsAt }, idempotency.key)
    const task = operation.then((saved) => {
      if (request !== revision || getUserId() !== userId) throw new BookingError('Sua seleção ou sessão mudou. Consulte seus agendamentos para verificar o resultado.')
      return { ...saved, serviceName: saved.serviceName ?? draft.service.title, barberName: saved.barberName ?? selected.name }
    }).finally(() => { if (pending?.task === task) pending = null; publish({ confirming: false }) })
    pending = { fingerprint, task }
    return task
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    setCatalog(services: Service[], barbers: ApiBarber[]) { catalog = services; professionals = barbers },
    start, reuse, selectProfessional, loadAvailability, confirm,
    setChoice(choice: DateTimeChoice) { publish({ choice }) },
    clear() { revision += 1; idempotency = null; publish({ draft: null, choice: { date: '', time: '' } }) },
  }
}
