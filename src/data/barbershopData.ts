export const BARBERS = [
  { id: 'sorriso', name: 'Sorriso', role: 'Barbeiro(a)', likes: 31 },
  { id: 'nailton', name: 'Nailton', role: 'Barbeiro(a)', likes: 30 },
  { id: 'bolacha', name: 'Bolacha', role: 'Barbeiro(a)', likes: 27 },
  { id: 'pedrinho', name: 'Pedrinho', role: 'Barbeiro(a)', likes: 23 },
  { id: 'jailson', name: 'Jailson', role: 'Barbeiro(a)', likes: 16 },
  { id: 'luizao', name: 'Luizão', role: 'Barbeiro(a)', likes: 7 },
  { id: 'richard', name: 'Richard', role: 'Barbeiro(a)', likes: 1 },
]

export const SERVICES = [
  { id: 'combo-1', category: 'Combos', name: '(COMBO 1) Corte + Barba + Sobrancelha', price: 100.00, durationMinutes: 60, description: 'Corte de cabelo + desenho ou remoção da barba + sobrancelha. Inclui experiência com toalha quente, massagem e hidratação da pele.' },
  { id: 'combo-2', category: 'Combos', name: '(COMBO 2) Corte + Barba', price: 90.00, durationMinutes: 60, description: 'Corte de cabelo + barba. Inclui experiência com toalha quente, massagem e hidratação da pele.' },
  { id: 'combo-3', category: 'Combos', name: '(COMBO 3) Corte + Barba + Sobrancelha + Depilação', price: 135.00, durationMinutes: 80, description: 'Corte de cabelo + Barba tradicional + Sobrancelha + Depilação do nariz e orelha.' },
  { id: 'corte-cabelo', category: 'Cabelo', name: 'Corte de Cabelo', price: 45.00, durationMinutes: 30, description: 'Corte de cabelo degradê ou corte de cabelo tradicional.' },
  { id: 'corte-sobrancelha', category: 'Cabelo', name: 'Corte de Cabelo + Sobrancelha', price: 55.00, durationMinutes: 30, description: 'Corte de cabelo degradê ou tradicional + sobrancelha.' },
  { id: 'corte-infantil', category: 'Cabelo', name: 'Corte de Cabelo Infantil', price: 45.00, durationMinutes: 30, description: 'Corte de cabelo com o uso de máquinas mais silenciosas.' },
  { id: 'barba', category: 'Barba', name: 'Barba', price: 45.00, durationMinutes: 30, description: 'Barbear os pelos da face com máquina ou navalha.' },
  { id: 'barba-sobrancelha', category: 'Barba', name: 'Barba + Sobrancelha', price: 55.00, durationMinutes: 30, description: 'Desenhar a barba com navalha ou cavanhaque + sobrancelha.' },
  { id: 'remocao-barba-maquina', category: 'Barba', name: 'Remoção da Barba com Máquina', price: 20.00, durationMinutes: 15, description: 'Aparar os pelos da barba somente com máquina (sem desenhar).' },
  { id: 'acabamento-sobrancelha', category: 'Acabamento', name: 'Acabamento + Sobrancelha', price: 40.00, durationMinutes: 30, description: 'Acabamento do cabelo (pezinho) e limpeza da sobrancelha.' },
  { id: 'acabamento-premium', category: 'Acabamento', name: 'Acabamento Premium', price: 20.00, durationMinutes: 30, description: 'Acabamento do cabelo (pezinho) com máquina ou navalha e ajuste na parte superior.' },
  { id: 'sobrancelha', category: 'Acabamento', name: 'Sobrancelha', price: 20.00, durationMinutes: 30, description: 'Limpeza da sobrancelha com navalha.' },
  { id: 'nevou-platinado', category: 'Coloração e Tratamentos', name: 'Nevou / Platinado (Descoloração)', price: 210.00, durationMinutes: 60, description: 'Descoloração total + Cronograma capilar (Hidratação, Nutrição e Reconstrução) + Matização.' },
  { id: 'luzes-reflexo', category: 'Coloração e Tratamentos', name: 'Luzes ou Reflexo', price: 190.00, durationMinutes: 60, description: 'Luzes + Cronograma capilar (Hidratação, Nutrição e Reconstrução).' },
  { id: 'progressiva', category: 'Coloração e Tratamentos', name: 'Progressiva', price: 140.00, durationMinutes: 60, description: 'Tratamento capilar químico para alisar os fios, reduzir o volume e o frizz.' },
  { id: 'selagem', category: 'Coloração e Tratamentos', name: 'Selagem / Redução de Volume', price: 110.00, durationMinutes: 60, description: 'Fechamento das cutículas, alinhamento dos fios, maciez, brilho e nutrição.' },
  { id: 'pigmentacao', category: 'Coloração e Tratamentos', name: 'Pigmentação', price: 50.00, durationMinutes: 30, description: 'Pigmentação parcial do cabelo.' },
  { id: 'cronograma-capilar', category: 'Coloração e Tratamentos', name: 'Cronograma Capilar de Hidratação', price: 40.00, durationMinutes: 20, description: 'Hidratação, Nutrição ou Umectação e Reconstrução.' },
  { id: 'limpeza-facial', category: 'Coloração e Tratamentos', name: 'Limpeza Facial', price: 40.00, durationMinutes: 30, description: 'Terapia facial: limpeza, hidratação e máscara black para remoção de cravos superficiais.' },
  { id: 'matizacao', category: 'Coloração e Tratamentos', name: 'Matização', price: 35.00, durationMinutes: 30, description: 'Neutralização de tons indesejados em cabelos coloridos ou platinados.' },
  { id: 'cera-nariz', category: 'Cera Quente', name: 'Remoção dos Pelos do Nariz', price: 20.00, durationMinutes: 10, description: 'Remoção de pelos nasais com cera quente.' },
  { id: 'cera-orelha', category: 'Cera Quente', name: 'Remoção dos Pelos da Orelha', price: 20.00, durationMinutes: 10, description: 'Remoção de pelos das orelhas com cera quente.' },
]

export const BARBERSHOP_INFO = {
  name: 'NA Barbearia', phone: '(13) 97404-0190', whatsappNumber: '5513974040190', rating: 5.0, totalReviews: 26,
  address: { street: 'Avenida Affonso Penna, 261', neighborhood: 'Macuco', city: 'Santos', state: 'SP', zipCode: '11020-001' },
  paymentMethods: ['Pix', 'Cartão de Crédito', 'Dinheiro', 'À Vista'],
  amenities: ['Wi-Fi', 'Ar-condicionado', 'Acesso para Deficientes', 'TV', 'Atendimento Adulto e Infantil'],
  businessHours: [
    { days: 'Segunda a Quarta-Feira', open: '10:00', close: '20:00' },
    { days: 'Quinta e Sexta-Feira', open: '10:00', close: '20:30' },
    { days: 'Sábado', open: '10:00', close: '19:00' },
    { days: 'Domingo', open: null, close: null, closed: true },
  ],
}

export type CatalogService = typeof SERVICES[number]
export type CatalogBarber = typeof BARBERS[number]
export const SERVICE_CATEGORIES = ['Todos', ...new Set(SERVICES.map((service) => service.category))]
export const FULL_ADDRESS = `${BARBERSHOP_INFO.address.street} - ${BARBERSHOP_INFO.address.neighborhood}, ${BARBERSHOP_INFO.address.city} - ${BARBERSHOP_INFO.address.state}, CEP ${BARBERSHOP_INFO.address.zipCode}`
export const WHATSAPP_URL = `https://wa.me/${BARBERSHOP_INFO.whatsappNumber}`
export const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(FULL_ADDRESS)}`

export function getBusinessHours(weekday: number) {
  return BARBERSHOP_INFO.businessHours[weekday === 0 ? 3 : weekday <= 3 ? 0 : weekday <= 5 ? 1 : 2]
}
