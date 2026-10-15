import { describe, expect, it } from 'vitest'
import { BARBERS, SERVICES, BARBERSHOP_INFO, SERVICE_CATEGORIES } from './barbershopData'
import { BOOKING_BARBERS, toServiceInfo } from './bookingCatalog'

describe('catálogo real da NA Barbearia', () => {
  it('contém os sete profissionais e suas recomendações fornecidas', () => {
    expect(BARBERS.map(({ name, likes }) => [name, likes])).toEqual([
      ['Sorriso', 31], ['Nailton', 30], ['Bolacha', 27], ['Pedrinho', 23], ['Jailson', 16], ['Luizão', 7], ['Richard', 1],
    ])
    expect(BOOKING_BARBERS.every((barber) => !barber.rating && !barber.reviewCount)).toBe(true)
  })
  it('oferece 22 serviços com identificadores únicos e seis categorias', () => {
    expect(SERVICES).toHaveLength(22)
    expect(new Set(SERVICES.map((service) => service.id)).size).toBe(22)
    expect(SERVICE_CATEGORIES).toEqual(['Todos', 'Combos', 'Cabelo', 'Barba', 'Acabamento', 'Coloração e Tratamentos', 'Cera Quente'])
  })
  it('preserva preço, duração e identidade de cada serviço no fluxo', () => {
    for (const service of SERVICES) {
      const info = toServiceInfo(service)
      expect(info).toMatchObject({ id: service.id, title: service.name, durationMinutes: service.durationMinutes, priceAmount: service.price, category: service.category, description: service.description })
      expect(info.duration).toBe(`${service.durationMinutes} min`)
      expect(info.price).toBe(new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(service.price))
    }
    expect(toServiceInfo(SERVICES.find((service) => service.id === 'combo-3')!)).toMatchObject({ priceAmount: 135, durationMinutes: 80 })
  })
  it('mantém o contato, a nota e as facilidades fornecidas', () => {
    expect(BARBERSHOP_INFO).toMatchObject({ whatsappNumber: '5513974040190', rating: 5, totalReviews: 26 })
    expect(BARBERSHOP_INFO.address.zipCode).toBe('11020-001')
    expect(BARBERSHOP_INFO.paymentMethods).toContain('Pix')
    expect(BARBERSHOP_INFO.amenities).toContain('Acesso para Deficientes')
  })
})
