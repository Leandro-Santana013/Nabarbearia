export interface PublicHours {
  label: string
  days: string
  open: string
  close: string
}

export interface PublicSiteConfig {
  brandName: string
  city: string
  address: {
    street: string
    neighborhood: string
    city: string
    state: string
    postalCode: string
    mapsUrl: string
  }
  phone: string
  phoneHref: string
  bookingUrl: string
  instagramUrl: string
  hours: readonly PublicHours[]
}

/**
 * Public facts are kept separate from the internal demo repository. If a
 * verified source changes, this is the only public content object to update.
 */
export const siteConfig = {
  brandName: 'NA Barbearia',
  city: 'Santos/SP',
  address: {
    street: 'Avenida Affonso Penna, 261',
    neighborhood: 'Macuco',
    city: 'Santos',
    state: 'SP',
    postalCode: '11020-001',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Avenida+Affonso+Penna%2C+261%2C+Macuco%2C+Santos%2C+SP%2C+11020-001',
  },
  phone: '(13) 97404-0190',
  phoneHref: 'tel:+5513974040190',
  bookingUrl: 'https://www.trinks.com/na-barbearia',
  instagramUrl: 'https://www.instagram.com/nabarbeariaa/',
  hours: [
    { label: 'Domingo', days: 'Dom', open: '10:00', close: '19:00' },
    { label: 'Segunda e terça', days: 'Seg–Ter', open: '10:00', close: '20:30' },
    { label: 'Quarta a sexta', days: 'Qua–Sex', open: '10:00', close: '20:00' },
  ],
} as const satisfies PublicSiteConfig
