import { describe, expect, it } from 'vitest'
import { BARBERSHOP_INFO } from '../data/barbershopData'
import { siteConfig } from './siteConfig'
import { createPublicMetadata, PUBLIC_SITE_ORIGIN, publicMetadataTags, serializeStructuredData } from './publicMetadata'

describe('metadados públicos', () => {
  it('usa os mesmos dados de endereço, contato e horários da unidade', () => {
    const metadata = createPublicMetadata()
    expect(metadata.structuredData.name).toBe(siteConfig.brandName)
    expect(metadata.structuredData.telephone).toBe(siteConfig.phoneHref.slice(4))
    expect(metadata.structuredData.address).toMatchObject({
      streetAddress: siteConfig.address.street,
      addressLocality: siteConfig.address.city,
      addressRegion: siteConfig.address.state,
      postalCode: siteConfig.address.postalCode,
    })
    expect(metadata.structuredData.sameAs).toContain(siteConfig.instagramUrl)
    const hours = metadata.structuredData.openingHoursSpecification
    expect(hours.map((entry) => [entry.opens, entry.closes])).toEqual(siteConfig.hours.map((entry) => entry.closed ? ['00:00', '00:00'] : [entry.open, entry.close]))
    expect(hours.flatMap((entry) => entry.dayOfWeek)).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => `https://schema.org/${day}`))
  })

  it('acompanha alterações da fonte de horários sem uma cópia no HTML', () => {
    const business = structuredClone(BARBERSHOP_INFO)
    business.businessHours[0].open = '11:15'
    business.businessHours[0].close = '19:45'
    const hours = createPublicMetadata(business).structuredData.openingHoursSpecification
    expect(hours[0]).toMatchObject({ opens: '11:15', closes: '19:45' })
    expect(createPublicMetadata().structuredData.openingHoursSpecification[0].opens).toBe(BARBERSHOP_INFO.businessHours[0].open)
  })

  it('não publica dias desconhecidos ou horários incompletos silenciosamente', () => {
    expect(() => createPublicMetadata({ ...BARBERSHOP_INFO, businessHours: [{ days: 'Feriado sem data', open: '10:00', close: '20:00' }] })).toThrow('Mapeamento de dias necessário')
    expect(() => createPublicMetadata({ ...BARBERSHOP_INFO, businessHours: [{ days: 'Sábado', open: null, close: '20:00' }] })).toThrow('Horário público incompleto')
  })

  it('mantém avaliações e imagens fictícias fora dos dados estruturados', () => {
    const data = createPublicMetadata().structuredData
    expect(data['@type']).toBe('HairSalon')
    expect(data).not.toHaveProperty('review')
    expect(data).not.toHaveProperty('aggregateRating')
    expect(data).not.toHaveProperty('rating')
    expect(JSON.stringify(data)).not.toContain('/illustrative/')
    expect(data.image).toEqual([`${PUBLIC_SITE_ORIGIN}/brand/na-team.webp`])
  })

  it('escapa a fronteira do script JSON sem alterar os dados ao fazer parse', () => {
    const text = '</script><script>alert("x")</script>&\u2028\u2029'
    const serialized = serializeStructuredData({ name: text })
    expect(serialized).not.toMatch(/[<>&\u2028\u2029]/)
    expect(JSON.parse(serialized)).toEqual({ name: text })
    const tags = publicMetadataTags({ ...BARBERSHOP_INFO, name: '</title><script>alert(1)</script>' })
    const title = tags.find((tag) => tag.tag === 'title')?.children
    expect(title).toContain('&lt;/title&gt;')
    expect(title).not.toContain('<script>')
  })

  it('gera uma única identidade canônica e a imagem social absoluta no HTML inicial', () => {
    const tags = publicMetadataTags()
    const metadata = createPublicMetadata()
    const canonical = tags.filter((tag) => tag.attrs?.rel === 'canonical')
    expect(canonical).toHaveLength(1)
    expect(canonical[0].attrs?.href).toBe(`${PUBLIC_SITE_ORIGIN}/`)
    expect(tags.find((tag) => tag.attrs?.property === 'og:url')?.attrs?.content).toBe(metadata.url)
    expect(tags.find((tag) => tag.attrs?.property === 'og:image')?.attrs?.content).toBe(metadata.image)
    expect(tags.find((tag) => tag.attrs?.property === 'og:image:width')?.attrs?.content).toBe('1200')
    expect(tags.find((tag) => tag.attrs?.property === 'og:image:height')?.attrs?.content).toBe('630')
    expect(tags.find((tag) => tag.attrs?.name === 'twitter:card')?.attrs?.content).toBe('summary_large_image')
    const dataTag = tags.find((tag) => tag.attrs?.type === 'application/ld+json')
    expect(JSON.parse(dataTag?.children as string)).toEqual(metadata.structuredData)
  })
})
