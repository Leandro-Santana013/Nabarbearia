import type { HtmlTagDescriptor } from 'vite'
import { BARBERSHOP_INFO } from '../data/barbershopData'

// Confirmed deployment origin, shared by the public website and the team app.
export const PUBLIC_SITE_ORIGIN = 'https://na-barbearia.duckdns.org'

interface BusinessMetadataInput {
  name: string
  whatsappNumber: string
  address: {
    street: string
    neighborhood: string
    city: string
    state: string
    zipCode: string
  }
  businessHours: readonly {
    days: string
    open: string | null
    close: string | null
    closed?: boolean
  }[]
}

const weekdays: Record<string, readonly string[]> = {
  'Segunda a Quarta-Feira': ['Monday', 'Tuesday', 'Wednesday'],
  'Quinta e Sexta-Feira': ['Thursday', 'Friday'],
  'Segunda-Feira': ['Monday'],
  'Terça-Feira': ['Tuesday'],
  'Quarta-Feira': ['Wednesday'],
  'Quinta-Feira': ['Thursday'],
  'Sexta-Feira': ['Friday'],
  'Sábado': ['Saturday'],
  'Domingo': ['Sunday'],
}

export function createPublicMetadata(business: BusinessMetadataInput = BARBERSHOP_INFO) {
  const url = `${PUBLIC_SITE_ORIGIN}/`
  const title = `${business.name} · ${business.address.city}/${business.address.state}`
  const description = `${business.name} no ${business.address.neighborhood}, em ${business.address.city}/${business.address.state}. Conheça os serviços e a equipe, veja como chegar e agende seu horário.`
  const image = `${PUBLIC_SITE_ORIGIN}/brand/og-cover.jpg`
  const imageAlt = `Símbolo oficial e equipe da ${business.name}, em ${business.address.city}/${business.address.state}`
  const openingHoursSpecification = business.businessHours.map((hours) => {
    const days = weekdays[hours.days]
    if (!days) throw new Error(`Mapeamento de dias necessário para os metadados públicos: ${hours.days}`)
    if (!hours.closed && (!hours.open || !hours.close)) throw new Error(`Horário público incompleto: ${hours.days}`)
    return {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: days.map((day) => `https://schema.org/${day}`),
      // Google represents a fully closed day with equal midnight values.
      opens: hours.closed ? '00:00' : hours.open,
      closes: hours.closed ? '00:00' : hours.close,
    }
  })
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'HairSalon',
    '@id': `${url}#barbearia`,
    name: business.name,
    description,
    url,
    telephone: `+${business.whatsappNumber}`,
    address: {
      '@type': 'PostalAddress',
      streetAddress: business.address.street,
      addressLocality: business.address.city,
      addressRegion: business.address.state,
      postalCode: business.address.zipCode,
      addressCountry: 'BR',
    },
    logo: `${PUBLIC_SITE_ORIGIN}/brand/na-logo-cutout.png`,
    image: [`${PUBLIC_SITE_ORIGIN}/brand/na-team.webp`],
    sameAs: ['https://www.instagram.com/nabarbeariaa/'],
    openingHoursSpecification,
  }
  return { url, title, description, image, imageAlt, structuredData }
}

export function serializeStructuredData(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)
}

function escapeTitle(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}

export function publicMetadataTags(business: BusinessMetadataInput = BARBERSHOP_INFO): HtmlTagDescriptor[] {
  const metadata = createPublicMetadata(business)
  const named = (name: string, content: string): HtmlTagDescriptor => ({ tag: 'meta', attrs: { name, content }, injectTo: 'head' })
  const property = (name: string, content: string): HtmlTagDescriptor => ({ tag: 'meta', attrs: { property: name, content }, injectTo: 'head' })
  return [
    { tag: 'title', children: escapeTitle(metadata.title), injectTo: 'head' },
    named('theme-color', '#00749C'),
    named('description', metadata.description),
    { tag: 'link', attrs: { rel: 'canonical', href: metadata.url }, injectTo: 'head' },
    { tag: 'link', attrs: { rel: 'icon', type: 'image/png', sizes: '64x64', href: '/favicon.png' }, injectTo: 'head' },
    property('og:type', 'website'),
    property('og:locale', 'pt_BR'),
    property('og:site_name', business.name),
    property('og:title', metadata.title),
    property('og:description', metadata.description),
    property('og:url', metadata.url),
    property('og:image', metadata.image),
    property('og:image:secure_url', metadata.image),
    property('og:image:type', 'image/jpeg'),
    property('og:image:width', '1200'),
    property('og:image:height', '630'),
    property('og:image:alt', metadata.imageAlt),
    named('twitter:card', 'summary_large_image'),
    named('twitter:title', metadata.title),
    named('twitter:description', metadata.description),
    named('twitter:image', metadata.image),
    named('twitter:image:alt', metadata.imageAlt),
    { tag: 'script', attrs: { id: 'public-business-metadata', type: 'application/ld+json' }, children: serializeStructuredData(metadata.structuredData), injectTo: 'head' },
  ]
}
