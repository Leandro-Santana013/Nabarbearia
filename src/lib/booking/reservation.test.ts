import { expect, it, vi } from 'vitest'
import { createReservation, serviceForDisplay } from './reservation'
import type { Appointment, Service, Barber } from '../../types'
import type { BookingReview } from '../../pages/DateTimeSelection.types'

const service: Service = { id: 'service', name: 'Corte', category: '', description: '', priceCents: 4599, durationMinutes: 30 }
const barbers: Barber[] = [{ id: 'one', name: 'Um', initials: 'U' }, { id: 'two', name: 'Dois', initials: 'D' }]
const saved: Appointment = { id: 'saved', clientName: 'Cliente', clientUserId: 'client', barberId: 'one', serviceId: 'service', date: '2026-11-01T13:00:00Z', time: '2026-11-01T13:00:00Z', startsAt: '2026-11-01T13:00:00Z', status: 'confirmed', amountCents: 3000, durationMinutes: 60 }
function setup() {
  let user: string | null = 'client'
  const gateway = {
    getAvailability: vi.fn(async (_service: string, _date: string, _barber?: string) => []),
    bookAppointment: vi.fn(async (_input: { barber_user_id: string; service_id: string; starts_at: string }, _key: string) => saved),
    rescheduleAppointment: vi.fn(async (_id: string, _startsAt: string) => saved),
  }
  let sequence = 0
  const flow = createReservation(gateway, () => user, { now: () => new Date('2026-10-30T12:00:00Z'), key: () => `key-${++sequence}` })
  flow.setCatalog([service], barbers)
  flow.start(service.id)
  const review = (): BookingReview => ({ service: serviceForDisplay(flow.getSnapshot().draft!.service), barber: flow.getSnapshot().draft!.barber,
    date: '2026-11-01', time: '10:00', timeZone: 'America/Sao_Paulo', startsAt: '2026-11-01T13:00:00Z', barberId: 'one' })
  return { flow, gateway, review, setUser: (id: string | null) => { user = id } }
}

it('dados reais exigem ID, centavos e duração numéricos sem depender de textos de exibição', () => {
  const { flow } = setup()
  expect(flow.getSnapshot().draft?.service).toMatchObject({ priceCents: 4599, durationMinutes: 30 })
  flow.setCatalog([{ ...service, durationMinutes: undefined as unknown as number }], barbers)
  expect(() => flow.start(service.id)).toThrow('dados necessários')
  expect(() => flow.start('demo-id')).toThrow('não está mais disponível')
})

it('qualquer disponível é resolvido para profissional concreto e valores finais vêm do servidor', async () => {
  const { flow, gateway, review } = setup()
  const result = await flow.confirm(review())
  expect(gateway.bookAppointment.mock.calls[0]).toEqual([{ barber_user_id: 'one', service_id: 'service', starts_at: '2026-11-01T13:00:00.000Z' }, 'key-1'])
  expect(result.amountCents).toBe(saved.amountCents)
  expect(result.barberName).toBe('Um')
})

it('resposta perdida conserva a chave da mesma intenção, inclusive ISO equivalente', async () => {
  const { flow, gateway, review } = setup()
  gateway.bookAppointment.mockRejectedValueOnce(new Error('resposta perdida'))
  await expect(flow.confirm(review())).rejects.toThrow('perdida')
  await flow.confirm({ ...review(), startsAt: '2026-11-01T10:00:00-03:00' })
  expect(gateway.bookAppointment.mock.calls.map((call) => call[1])).toEqual(['key-1', 'key-1'])
})

it('cliques repetidos compartilham a operação pendente e impedem outra intenção concorrente', async () => {
  const { flow, gateway, review } = setup()
  let release!: (item: Appointment) => void
  gateway.bookAppointment.mockReturnValueOnce(new Promise((done) => { release = done }))
  const first = flow.confirm(review())
  expect(flow.confirm(review())).toBe(first)
  expect(() => flow.confirm({ ...review(), time: '11:00', startsAt: '2026-11-01T14:00:00Z' })).toThrow('Aguarde')
  expect(gateway.bookAppointment).toHaveBeenCalledOnce()
  release(saved)
  await first
})

it('mudar o horário após conflito gera uma nova intenção', async () => {
  const { flow, gateway, review } = setup()
  gateway.bookAppointment.mockRejectedValueOnce(new Error('conflito'))
  await expect(flow.confirm(review())).rejects.toThrow('conflito')
  await flow.confirm({ ...review(), time: '11:00', startsAt: '2026-11-01T14:00:00Z' })
  expect(gateway.bookAppointment.mock.calls.map((call) => call[1])).toEqual(['key-1', 'key-2'])
})

it('remarcação mantém ID e dados históricos; agendar novamente usa catálogo atual', async () => {
  const { flow, gateway, review } = setup()
  flow.reuse(saved, true)
  expect(flow.getSnapshot().draft?.service).toMatchObject({ priceCents: 3000, durationMinutes: 60 })
  await flow.confirm(review())
  expect(gateway.rescheduleAppointment).toHaveBeenCalledWith('saved', '2026-11-01T13:00:00.000Z')
  expect(gateway.bookAppointment).not.toHaveBeenCalled()
  flow.reuse(saved)
  expect(flow.getSnapshot().draft?.service).toMatchObject({ priceCents: 4599, durationMinutes: 30 })
})

it('recusa profissional incorreto, slot de outra data ou catálogo desativado', () => {
  const { flow, review } = setup()
  flow.selectProfessional('two')
  expect(() => flow.confirm(review())).toThrow('profissional mudou')
  flow.selectProfessional('any')
  expect(() => flow.confirm({ ...review(), date: '2026-11-02' })).toThrow('horário ou profissional')
  flow.setCatalog([{ ...service, active: false }], barbers)
  expect(() => flow.confirm(review())).toThrow('não está mais disponível')
})

it('não publica resposta de uma sessão ou seleção anterior', async () => {
  const { flow, gateway, review, setUser } = setup()
  let release!: (item: Appointment) => void
  gateway.bookAppointment.mockReturnValueOnce(new Promise((done) => { release = done }))
  const confirmation = flow.confirm(review())
  setUser('other-client')
  release(saved)
  await expect(confirmation).rejects.toThrow('sessão mudou')
  setUser(null)
  expect(() => flow.confirm(review())).toThrow('Entre na sua conta')
})
