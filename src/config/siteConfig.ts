export interface PublicHours {
  label: string
  days: string
  open: string
  close: string
}

export interface PublicTeamMember {
  name: string
  role: string
  specialty: string
  photoUrl: string
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
  instagramUrl: 'https://www.instagram.com/nabarbeariaa/',
  brandImageUrl: 'https://d39p7gjvbgwtet.cloudfront.net/Estabelecimentos/89157/800x500/logo_000089157.jpg?v=20240714190600',
  mapEmbedUrl: 'https://www.google.com/maps?q=Avenida+Affonso+Penna%2C+261%2C+Macuco%2C+Santos%2C+SP%2C+11020-001&output=embed',
  hours: [
    { label: 'Domingo', days: 'Dom', open: '10:00', close: '19:00' },
    { label: 'Segunda e terça', days: 'Seg–Ter', open: '10:00', close: '20:30' },
    { label: 'Quarta a sexta', days: 'Qua–Sex', open: '10:00', close: '20:00' },
  ],
  team: [
    { name: 'Nailton', role: 'Barbeiro(a)', specialty: 'Acabamento · Barba · Cabelo', photoUrl: 'https://d39p7gjvbgwtet.cloudfront.net/Pessoas/120x120/p_foto_000412294.jpg?v=20241202131500', recommendations: 30 },
    { name: 'Sorriso', role: 'Barbeiro(a)', specialty: 'Acabamento · Barba · Cabelo', photoUrl: 'https://d39p7gjvbgwtet.cloudfront.net/Pessoas/120x120/p_foto_000638145.jpg?v=20251208164800', recommendations: 29 },
    { name: 'Bolacha', role: 'Barbeiro(a)', specialty: 'Acabamento · Barba · Cabelo', photoUrl: 'https://d39p7gjvbgwtet.cloudfront.net/Pessoas/120x120/p_foto_000412300.jpg?v=20231009183300', recommendations: 26 },
    { name: 'Pedrinho', role: 'Barbeiro(a)', specialty: 'Acabamento · Cabelo', photoUrl: 'https://d39p7gjvbgwtet.cloudfront.net/Pessoas/120x120/p_foto_000716922.jpg?v=20260108195100', recommendations: 22 },
    { name: 'JAILSON', role: 'Barbeiro(a)', specialty: 'Acabamento · Barba · Cabelo', photoUrl: 'https://d39p7gjvbgwtet.cloudfront.net/Pessoas/120x120/p_foto_000533829.jpg?v=20251201222100', recommendations: 16 },
    { name: 'Luizão', role: 'Barbeiro(a)', specialty: 'Acabamento · Cabelo', photoUrl: 'https://d39p7gjvbgwtet.cloudfront.net/Pessoas/120x120/p_foto_000717914.jpg?v=20260113155100', recommendations: 7 },
    { name: 'Guilherme', role: 'Barbeiro(a)', specialty: 'Acabamento · Barba · Cabelo', photoUrl: 'https://d39p7gjvbgwtet.cloudfront.net/Pessoas/120x120/p_foto_000603949.jpg?v=20260728204700', recommendations: 0 },
  ],
} as const satisfies PublicSiteConfig
