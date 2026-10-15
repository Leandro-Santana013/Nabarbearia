import { BARBERS, BARBERSHOP_INFO, FULL_ADDRESS, MAPS_URL } from "@/data/barbershopData"

export interface PublicHours {
  label: string
  days: string
  open: string | null
  close: string | null
  closed?: boolean
}

export interface PublicTeamMember {
  name: string
  role: string
  specialty: string
  photoUrl?: string
  recommendations: number
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
  instagramUrl: string
  brandImageUrl: string
  mapEmbedUrl: string
  hours: readonly PublicHours[]
  team: readonly PublicTeamMember[]
}

const photoById: Record<string, string> = {
  nailton: 'https://d39p7gjvbgwtet.cloudfront.net/Pessoas/original/p_foto_000412294.jpg?v=20241202131500',
  sorriso: 'https://www.trinks.com/imagens?path=Pessoas/original/p_foto_000638145.jpg?v=20251208164800',
  bolacha: 'https://www.trinks.com/imagens?path=Pessoas/original/p_foto_000412300.jpg?v=20231009183300',
  pedrinho: 'https://d39p7gjvbgwtet.cloudfront.net/Pessoas/original/p_foto_000716922.jpg?v=20260108195100',
  jailson: 'https://www.trinks.com/imagens?path=Pessoas/original/p_foto_000533829.jpg?v=20251201222100',
  luizao: 'https://d39p7gjvbgwtet.cloudfront.net/Pessoas/original/p_foto_000717914.jpg?v=20260113155100',
}

export const siteConfig = {
  brandName: BARBERSHOP_INFO.name,
  city: `${BARBERSHOP_INFO.address.city}/${BARBERSHOP_INFO.address.state}`,
  address: { ...BARBERSHOP_INFO.address, postalCode: BARBERSHOP_INFO.address.zipCode, mapsUrl: MAPS_URL },
  phone: BARBERSHOP_INFO.phone,
  phoneHref: `tel:+${BARBERSHOP_INFO.whatsappNumber}`,
  instagramUrl: 'https://www.instagram.com/nabarbeariaa/',
  brandImageUrl: 'https://d39p7gjvbgwtet.cloudfront.net/Estabelecimentos/89157/800x500/logo_000089157.jpg?v=20240714190600',
  mapEmbedUrl: `https://www.google.com/maps?q=${encodeURIComponent(FULL_ADDRESS)}&output=embed`,
  hours: BARBERSHOP_INFO.businessHours.map((hours) => ({ ...hours, label: hours.days })),
  team: BARBERS.map((barber) => ({
    name: barber.name, role: barber.role, specialty: barber.role,
    photoUrl: photoById[barber.id], recommendations: barber.likes,
  })),
} satisfies PublicSiteConfig
