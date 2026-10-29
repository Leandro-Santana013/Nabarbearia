import type { Appointment, Barber as ApiBarber, Service } from '@/types'
import type { AvailabilitySlot } from '@/services/api'
import { ApiError } from '@/services/api'
import type { CatalogService } from '@/data/barbershopData'
import { SERVICE_CATEGORIES } from '@/data/barbershopData'
import type { ClientAppointment } from '@/pages/MyAppointments.types'
import type { Barber } from '@/pages/ServiceDetail.types'
import { shopDate, scheduleTime } from './barber-schedule'

export function catalogFromApi(services: Service[]): CatalogService[] {
  return services.filter((item) => item.active !== false).map((item) => ({
    id: item.id, name: item.name, description: item.description ?? '', price: item.priceCents / 100,
    durationMinutes: item.durationMinutes,
    category: item.category?.toLowerCase() === 'combos' ? 'Combos' : item.category === 'Remoção com Cera Quente' ? 'Cera Quente' : item.category || 'Outros',
  })).sort((a, b) => {
    const rank = (category: string) => { const index = SERVICE_CATEGORIES.indexOf(category); return index < 0 ? 99 : index }
    return rank(a.category) - rank(b.category)
  })
}
export function barbersFromApi(barbers: ApiBarber[]): Barber[] {
  return barbers.filter((item) => item.active !== false).map((item) => ({ id: item.id, name: item.name, specialty: item.specialty ?? 'Barbeiro(a)', likes: item.recommendations ?? 0, avatar: item.photoUrl }))
}
export function appointmentFromApi(item: Appointment, barbers: Barber[]): ClientAppointment {
  const start = item.startsAt ?? item.date
  return {
    id: item.id, startsAt: start, date: shopDate(new Date(start)), time: scheduleTime(start), timeZone: 'America/Sao_Paulo',
    status: item.status, rating: item.rating,
    service: { id: item.serviceId, title: item.serviceName ?? 'Serviço agendado', category: '', description: '',
      price: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.amountCents / 100),
      priceAmount: item.amountCents / 100, duration: `${item.durationMinutes ?? 0} min`, durationMinutes: item.durationMinutes },
    barber: barbers.find((barber) => barber.id === item.barberId) ?? { id: item.barberId, name: item.barberName ?? 'Profissional', specialty: 'Barbeiro(a)' },
  }
}
export function availabilityFromApi(slots: AvailabilitySlot[], date: string, now = new Date()) {
  const unique = new Map<string, { time: string; period: string; disabled: boolean; startsAt: string; barberId: string }>()
  for (const slot of slots) {
    if (shopDate(new Date(slot.starts_at)) !== date) continue
    const time = scheduleTime(slot.starts_at)
    if (!unique.has(time)) unique.set(time, {
      time, period: time < '12:00' ? 'morning' : time < '18:00' ? 'afternoon' : 'evening',
      disabled: new Date(slot.starts_at).getTime() <= now.getTime(), startsAt: slot.starts_at, barberId: slot.barber_id,
    })
  }
  return [...unique.values()].sort((a, b) => a.time.localeCompare(b.time))
}
export function clientError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Sua sessão expirou. Entre novamente para continuar.'
    if (error.code === 'RATING_EXISTS') return 'Este atendimento já foi avaliado.'
    return error.message
  }
  return 'Não foi possível conectar à barbearia. Tente novamente.'
}
