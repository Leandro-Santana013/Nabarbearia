import { describe, expect, it } from 'vitest'
import { appointmentFromApi, availabilityFromApi, catalogFromApi } from './client-api'

describe('integração da área do cliente', () => {
  it('preserva IDs da API e converte centavos, duração e categorias para o catálogo', () => {
    const catalog = catalogFromApi([
      { id: 'backend-combo', name: 'Combo', category: 'COMBOS', priceCents: 13500, durationMinutes: 80, description: 'Completo', active: true },
      { id: 'backend-wax', name: 'Cera', category: 'Remoção com Cera Quente', priceCents: 2000, durationMinutes: 10, description: '', active: true },
      { id: 'inactive', name: 'Inativo', category: '', priceCents: 9999, durationMinutes: 10, description: '', active: false },
    ])
    expect(catalog).toHaveLength(2)
    expect(catalog[0]).toMatchObject({ id: 'backend-combo', category: 'Combos', price: 135, durationMinutes: 80 })
    expect(catalog[1]).toMatchObject({ id: 'backend-wax', category: 'Cera Quente', price: 20 })
  })
  it('agrupa horários de qualquer profissional sem perder o vínculo com o slot real', () => {
    const slots = availabilityFromApi([
      { barber_id: 'one', starts_at: '2026-10-16T13:15:00Z', ends_at: '2026-10-16T14:15:00Z' },
      { barber_id: 'two', starts_at: '2026-10-16T13:15:00Z', ends_at: '2026-10-16T14:15:00Z' },
      { barber_id: 'two', starts_at: '2026-10-16T14:00:00Z', ends_at: '2026-10-16T15:00:00Z' },
      { barber_id: 'one', starts_at: '2026-10-17T13:15:00Z', ends_at: '2026-10-17T14:15:00Z' },
    ], '2026-10-16', new Date('2026-10-16T13:30:00Z'))
    expect(slots).toHaveLength(2)
    expect(slots[0]).toMatchObject({ time: '10:15', barberId: 'one', startsAt: '2026-10-16T13:15:00Z', disabled: true })
    expect(slots[1]).toMatchObject({ time: '11:00', barberId: 'two', disabled: false })
  })
  it('usa valores e avaliação persistidos no histórico, sem substituir pelo catálogo atual', () => {
    const item = appointmentFromApi({ id: 'saved', clientName: 'Cliente', barberId: 'sorriso-api', barberName: 'Sorriso',
      serviceId: 'combo-api', serviceName: 'Combo', date: '2026-10-16T01:30:00Z', time: '2026-10-16T01:30:00Z',
      status: 'completed', amountCents: 9000, durationMinutes: 60, rating: 5 }, [])
    expect(item).toMatchObject({ id: 'saved', date: '2026-10-15', time: '22:30', rating: 5, status: 'completed',
      service: { id: 'combo-api', priceAmount: 90, durationMinutes: 60 }, barber: { id: 'sorriso-api', name: 'Sorriso' } })
  })
})
