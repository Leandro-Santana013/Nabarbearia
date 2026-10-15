import { describe, expect, it } from 'vitest'
import { splitAppointments } from './client-appointments'
import type { ClientAppointment } from '@/pages/MyAppointments.types'

const appointment = (id: string, date: string, status: ClientAppointment['status'] = 'confirmed'): ClientAppointment => ({
  id, date, time: '14:45', status, timeZone: 'America/Sao_Paulo',
  service: { title: 'Corte', category: 'Cabelo', duration: '35 min', price: 'R$ 45,00', description: '' },
  barber: { id: 'david', name: 'David', specialty: 'Master Barber', rating: '4.9', reviewCount: 100 },
})

describe('listas de agendamentos', () => {
  it('separa futuros confirmados de cancelados, concluídos e confirmados passados', () => {
    const { upcoming, history } = splitAppointments([
      appointment('future', '2026-10-20'), appointment('cancelled', '2026-10-21', 'cancelled'),
      appointment('completed', '2026-09-10', 'completed'), appointment('past', '2026-10-14'),
    ], new Date('2026-10-15T15:00:00Z'))
    expect(upcoming.map((item) => item.id)).toEqual(['future'])
    expect(history.map((item) => item.id)).toEqual(['cancelled', 'past', 'completed'])
  })

  it('ordena próximos por data crescente sem alterar a lista de entrada', () => {
    const input = [appointment('later', '2027-01-02'), appointment('earlier', '2026-12-31')]
    expect(splitAppointments(input, new Date('2026-10-15T15:00:00Z')).upcoming.map((item) => item.id)).toEqual(['earlier', 'later'])
    expect(input.map((item) => item.id)).toEqual(['later', 'earlier'])
  })

  it('usa São Paulo para classificar horários próximos da meia-noite UTC', () => {
    const input = [{ ...appointment('tonight', '2026-10-15'), time: '23:30' }]
    expect(splitAppointments(input, new Date('2026-10-16T01:00:00Z')).upcoming).toHaveLength(1)
    expect(splitAppointments([], new Date('2026-10-16T01:00:00Z'))).toEqual({ upcoming: [], history: [] })
  })
})
