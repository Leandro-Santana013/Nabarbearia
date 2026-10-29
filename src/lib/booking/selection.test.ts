import { expect, it, vi } from 'vitest'
import { ApiError } from '../../services/api'
import { demoAvailability, getTimeSlots, realAvailability } from './availability'
import { createBookingSelection } from './selection'

const service = { id: 'service', title: 'Corte', category: '', description: '', price: 'R$ 45,00', duration: '30 min', durationMinutes: 30 }
const barber = { id: 'any', name: 'Qualquer disponível', specialty: '', isAny: true }
const now = () => new Date('2026-10-30T10:00:00Z')
const slot = (date = '2026-11-01', time = '13:00') => ({ barber_id: 'barber', starts_at: `${date}T${time}:00Z`, ends_at: `${date}T14:00:00Z` })
function setup(load = vi.fn(async (_date: string) => [slot()]), onConfirm = vi.fn(async () => {})) {
  const selection = createBookingSelection(realAvailability(load), { service, barber, now, initialDate: '2026-11-01', onConfirm })
  return { selection, load, onConfirm }
}

it('consulta domingo real, enquanto demonstração mantém expediente e fechamento', async () => {
  const { selection } = setup()
  expect(selection.getSnapshot().days.find((day) => day.date === '2026-11-01')?.closed).toBe(false)
  await selection.reload()
  selection.selectTime('10:00')
  expect(selection.review()).toMatchObject({ startsAt: '2026-11-01T13:00:00Z', barberId: 'barber' })
  const demo = createBookingSelection(demoAvailability(30), { service, barber, now })
  expect(demo.getSnapshot().days.find((day) => day.date === '2026-11-01')?.closed).toBe(true)
  expect(getTimeSlots('2026-10-31', now(), 80).at(-1)?.time).toBe('17:30')
})

it('ignora disponibilidade atrasada de um dia anterior', async () => {
  let release!: (slots: ReturnType<typeof slot>[]) => void
  const load = vi.fn().mockReturnValueOnce(new Promise((done) => { release = done })).mockResolvedValueOnce([slot('2026-11-02')])
  const { selection } = setup(load)
  const first = selection.reload()
  selection.selectDate('2026-11-02')
  await vi.waitFor(() => expect(selection.getSnapshot().loading).toBe(false))
  release([slot()])
  await first
  expect(selection.getSnapshot().date).toBe('2026-11-02')
  expect(selection.slots()[0].startsAt).toContain('2026-11-02')
})

it('resposta perdida mantém seleção para repetir a mesma intenção', async () => {
  const onConfirm = vi.fn().mockRejectedValueOnce(new ApiError('Rede', 'NETWORK_ERROR', 0)).mockResolvedValueOnce(undefined)
  const { selection, load } = setup(undefined, onConfirm)
  await selection.reload()
  selection.selectTime('10:00')
  await selection.confirm()
  expect(selection.getSnapshot().time).toBe('10:00')
  expect(load).toHaveBeenCalledOnce()
  expect(selection.validate()).toBe(true)
  await selection.confirm()
  expect(onConfirm.mock.calls[0]).toEqual(onConfirm.mock.calls[1])
})

it('conflito atualiza horários e permite escolher outro sem repetir o slot rejeitado', async () => {
  const load = vi.fn().mockResolvedValueOnce([slot()]).mockResolvedValueOnce([slot('2026-11-01', '13:30')])
  const onConfirm = vi.fn().mockRejectedValueOnce(new ApiError('Indisponível', 'SLOT_UNAVAILABLE', 409)).mockResolvedValueOnce(undefined)
  const { selection } = setup(load, onConfirm)
  await selection.reload()
  selection.selectTime('10:00')
  await selection.confirm()
  expect(selection.validate()).toBe(false)
  selection.selectTime('10:30')
  expect(selection.validate()).toBe(true)
  await selection.confirm()
  expect(onConfirm.mock.calls[1][0].time).toBe('10:30')
})

it('revalida relógio ao confirmar e não confirma horário iniciado com tela aberta', async () => {
  let current = new Date('2026-11-01T12:59:00Z')
  const confirm = vi.fn()
  const selection = createBookingSelection(realAvailability(async () => [slot()]), { service, barber, now: () => current, onConfirm: confirm })
  await selection.reload()
  selection.selectTime('10:00')
  expect(selection.review()).not.toBeNull()
  current = new Date('2026-11-01T13:00:00Z')
  await selection.confirm()
  expect(confirm).not.toHaveBeenCalled()
})

it('falha de consulta pode ser repetida', async () => {
  const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([slot()])
  const { selection } = setup(load)
  await selection.reload()
  expect(selection.getSnapshot().slotError).not.toBe('')
  await selection.reload()
  expect(selection.getSnapshot().slotError).toBe('')
  expect(selection.slots()).toHaveLength(1)
})

it('desmontagem ignora resposta de consulta anterior', async () => {
  let release!: (slots: ReturnType<typeof slot>[]) => void
  const { selection } = setup(vi.fn(() => new Promise((done) => { release = done })))
  const changed = vi.fn()
  const unsubscribe = selection.subscribe(changed)
  const loading = selection.reload()
  expect(changed).toHaveBeenCalledOnce()
  selection.dispose()
  release([slot()])
  await loading
  expect(changed).toHaveBeenCalledOnce()
  unsubscribe()
})
