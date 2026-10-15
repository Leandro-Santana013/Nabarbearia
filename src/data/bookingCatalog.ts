import { BARBERS, SERVICES, type CatalogService } from './barbershopData'
import type { Barber, ServiceInfo } from '@/pages/ServiceDetail.types'

export function toServiceInfo(service: CatalogService): ServiceInfo {
  return {
    id: service.id, title: service.name, category: service.category,
    price: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(service.price),
    priceAmount: service.price, duration: `${service.durationMinutes} min`, durationMinutes: service.durationMinutes,
    description: service.description,
  }
}
export const BOOKING_BARBERS: Barber[] = BARBERS.map((barber) => ({
  id: barber.id, name: barber.name, specialty: barber.role, likes: barber.likes,
}))
export const DEFAULT_SERVICE = toServiceInfo(SERVICES.find((service) => service.id === 'combo-2')!)
export const DEFAULT_BARBER = BOOKING_BARBERS[0]
