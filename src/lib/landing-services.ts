import type { Service } from '@/types'

export type LandingServiceGroupId = 'cabelo' | 'barba' | 'combos'
export type LandingService = Pick<Service, 'id' | 'name' | 'priceCents' | 'durationMinutes'>
export type LandingServiceGroups = Record<LandingServiceGroupId, LandingService[]>

function groupForCategory(category: string): LandingServiceGroupId | undefined {
  switch (category.trim().toLocaleLowerCase('pt-BR')) {
    case 'cabelo': return 'cabelo'
    case 'barba': return 'barba'
    case 'combos': return 'combos'
    default: return undefined
  }
}

function validService(service: Service): boolean {
  return Boolean(service && typeof service.id === 'string' && service.id.trim()
    && typeof service.name === 'string' && service.name.trim()
    && typeof service.category === 'string' && service.active !== false
    && Number.isSafeInteger(service.priceCents) && service.priceCents >= 0
    && Number.isSafeInteger(service.durationMinutes) && service.durationMinutes > 0)
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, 'pt-BR') || (left < right ? -1 : left > right ? 1 : 0)
}

export function groupLandingServices(services: readonly Service[]): LandingServiceGroups {
  const groups: LandingServiceGroups = { cabelo: [], barba: [], combos: [] }
  const seenIds = new Set<string>()
  const candidates = services.filter(validService).filter((service) => groupForCategory(service.category))
    .sort((left, right) => compareText(left.name, right.name) || compareText(left.id, right.id)
      || compareText(left.category, right.category) || left.priceCents - right.priceCents
      || left.durationMinutes - right.durationMinutes)

  for (const service of candidates) {
    if (seenIds.has(service.id)) continue
    seenIds.add(service.id)
    const group = groupForCategory(service.category)!
    if (groups[group].length === 2) continue
    groups[group].push({
      id: service.id,
      name: service.name,
      priceCents: service.priceCents,
      durationMinutes: service.durationMinutes,
    })
  }
  return groups
}
