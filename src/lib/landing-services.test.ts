import { describe, expect, it } from 'vitest'
import type { Service } from '@/types'
import { groupLandingServices } from './landing-services'

function service(overrides: Partial<Service> = {}): Service {
  return {
    id: 'corte-api', name: 'Corte de cabelo', category: 'Cabelo', description: '',
    priceCents: 4590, durationMinutes: 35, ...overrides,
  }
}

describe('vitrine pública de serviços', () => {
  it('mantém categorias editoriais sem inventar valores quando o catálogo está vazio', () => {
    expect(groupLandingServices([])).toEqual({ cabelo: [], barba: [], combos: [] })
  })

  it('reconhece apenas categorias explícitas normalizadas, sem inferir pelo nome', () => {
    const groups = groupLandingServices([
      service({ category: '  CABELO ' }),
      service({ id: 'barba-api', category: ' barba ', name: 'Tradicional' }),
      service({ id: 'combo-api', category: 'CoMbOs', name: 'Completo' }),
      service({ id: 'other', category: 'Acabamento', name: 'Corte de cabelo e barba' }),
      service({ id: 'alias', category: 'Combo', name: 'Combo' }),
      service({ id: 'english', category: 'Hair', name: 'Cabelo' }),
    ])
    expect(groups.cabelo.map((item) => item.id)).toEqual(['corte-api'])
    expect(groups.barba.map((item) => item.id)).toEqual(['barba-api'])
    expect(groups.combos.map((item) => item.id)).toEqual(['combo-api'])
  })

  it('mantém preço em centavos e duração vinculados ao mesmo serviço ativo', () => {
    const groups = groupLandingServices([
      service({ id: 'a', name: 'Adulto', priceCents: 4590, durationMinutes: 35, active: true }),
      service({ id: 'b', name: 'Infantil', priceCents: 0, durationMinutes: 20 }),
      service({ id: 'inactive', name: 'Antigo', priceCents: 990, durationMinutes: 10, active: false }),
    ])
    expect(groups.cabelo).toEqual([
      { id: 'a', name: 'Adulto', priceCents: 4590, durationMinutes: 35 },
      { id: 'b', name: 'Infantil', priceCents: 0, durationMinutes: 20 },
    ])
  })

  it('descarta dados inválidos sem transformá-los em preço ou duração exibíveis', () => {
    const invalid = [
      service({ id: '' }), service({ name: '  ' }),
      service({ priceCents: -1 }), service({ priceCents: 45.9 }),
      service({ priceCents: Number.NaN }), service({ priceCents: Number.POSITIVE_INFINITY }),
      service({ priceCents: Number.MAX_SAFE_INTEGER + 1 }),
      service({ durationMinutes: 0 }), service({ durationMinutes: -5 }),
      service({ durationMinutes: 1.5 }), service({ durationMinutes: Number.NaN }),
      service({ durationMinutes: Number.POSITIVE_INFINITY }),
      { ...service(), priceCents: '4590' } as unknown as Service,
      { ...service(), category: null } as unknown as Service,
      null as unknown as Service,
    ]
    expect(groupLandingServices(invalid)).toEqual({ cabelo: [], barba: [], combos: [] })
  })

  it('seleciona no máximo dois por categoria de maneira estável sem alterar a entrada', () => {
    const catalog = [
      service({ id: 'z', name: 'Zigue-zague' }),
      service({ id: 'b', name: 'Ágil', priceCents: 3000, durationMinutes: 15 }),
      service({ id: 'a', name: 'Ágil', priceCents: 4000, durationMinutes: 30 }),
      service({ id: 'barba', name: 'Barba', category: 'Barba' }),
    ]
    const before = structuredClone(catalog)
    const groups = groupLandingServices(catalog)
    expect(groups.cabelo.map((item) => item.id)).toEqual(['a', 'b'])
    expect(groups.barba.map((item) => item.id)).toEqual(['barba'])
    expect(groupLandingServices([...catalog].reverse())).toEqual(groups)
    expect(catalog).toEqual(before)
  })

  it('não repete IDs, inclusive em categorias diferentes e respostas com duplicatas conflitantes', () => {
    const catalog = [
      service({ id: 'same', name: 'Mesmo', category: 'Cabelo', priceCents: 6000 }),
      service({ id: 'same', name: 'Mesmo', category: 'Barba', priceCents: 5000 }),
      service({ id: 'same', name: 'Mesmo', category: 'Barba', priceCents: 3000 }),
      service({ id: 'other', name: 'Outro' }),
    ]
    const groups = groupLandingServices(catalog)
    expect(Object.values(groups).flat().map((item) => item.id).sort()).toEqual(['other', 'same'])
    expect(groupLandingServices([...catalog].reverse())).toEqual(groups)
    expect(groups.barba[0]).toMatchObject({ id: 'same', priceCents: 3000, durationMinutes: 35 })
  })
})
