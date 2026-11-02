export interface LandingPhoto {
  src: string
  alt: string
  caption: string
  width: number
  height: number
  illustrative?: boolean
}

export interface LandingGalleryPhoto extends LandingPhoto {
  id: string
}

interface TestimonialText {
  id: string
  quote: string
  author: string
}

export type LandingTestimonial = TestimonialText & (
  | { kind: 'verified'; sourceLabel: string; sourceUrl: string }
  | { kind: 'illustrative' }
)

export interface LandingFaq {
  id: string
  question: string
  answer: string
}

export interface LandingContent {
  gallery: readonly LandingGalleryPhoto[]
  testimonials: readonly LandingTestimonial[]
  shopPhoto?: LandingPhoto
  whatsappNumber?: string
  paymentMethods: readonly string[]
  amenities: readonly string[]
  faq: readonly LandingFaq[]
}

// Public content only: illustrative material is temporary and visibly labelled.
// Add real customer content only after its source and use have been confirmed.
// Do not store private drafts here; this configuration ships in the browser.
export const landingContent: LandingContent = {
  gallery: [
    { id: 'fade', src: '/brand/illustrative/fade.png', alt: 'Exemplo ilustrativo de corte com degradê baixo, visto de costas', caption: 'Degradê baixo', width: 1086, height: 1448, illustrative: true },
    { id: 'textura', src: '/brand/illustrative/textura.png', alt: 'Exemplo ilustrativo de cabelo cacheado curto com textura', caption: 'Textura e movimento', width: 1086, height: 1448, illustrative: true },
    { id: 'classico', src: '/brand/illustrative/classico.png', alt: 'Exemplo ilustrativo de corte clássico com divisão lateral', caption: 'Clássico na medida', width: 1086, height: 1448, illustrative: true },
    { id: 'barba', src: '/brand/illustrative/barba.png', alt: 'Exemplo ilustrativo de barba cheia com contorno definido', caption: 'Barba alinhada', width: 1086, height: 1448, illustrative: true },
    { id: 'acabamento', src: '/brand/illustrative/acabamento.png', alt: 'Exemplo ilustrativo de acabamento de barba e costeleta', caption: 'Cuidado nos detalhes', width: 1086, height: 1448, illustrative: true },
    { id: 'combo', src: '/brand/illustrative/combo.png', alt: 'Exemplo ilustrativo de combinação de cabelo curto e barba', caption: 'Cabelo e barba', width: 1086, height: 1448, illustrative: true },
  ],
  shopPhoto: { src: '/brand/illustrative/ambiente.png', alt: 'Ambiente fictício de barbearia com cadeira preta e detalhes azuis', caption: 'Referência de ambiente para esta apresentação.', width: 1536, height: 1024, illustrative: true },
  testimonials: [
    { id: 'exemplo-1', kind: 'illustrative', author: 'Cliente exemplo 01', quote: 'Gostei de como o corte foi ajustado ao meu estilo. Saí com o visual que tinha em mente.' },
    { id: 'exemplo-2', kind: 'illustrative', author: 'Cliente exemplo 02', quote: 'A conversa foi boa e o acabamento da barba fez a diferença no resultado.' },
    { id: 'exemplo-3', kind: 'illustrative', author: 'Cliente exemplo 03', quote: 'Escolhi o horário na agenda e consegui organizar a visita na minha rotina.' },
  ],
  whatsappNumber: '5513974040190',
  paymentMethods: ['Pix', 'Cartão de crédito', 'Dinheiro'],
  amenities: ['Wi-Fi', 'Ar-condicionado', 'TV', 'Atendimento infantil', 'Acessibilidade física'],
  faq: [
    {
      id: 'conta',
      question: 'Preciso de uma conta para agendar?',
      answer: 'Você pode conhecer os serviços por aqui. Para confirmar um horário, entre na sua conta ou faça o cadastro de cliente.',
    },
    {
      id: 'profissional',
      question: 'Posso escolher meu profissional?',
      answer: 'Sim. Na área de agendamento, escolha o serviço e selecione um profissional ou a opção de qualquer disponível. Depois, consulte os horários da agenda.',
    },
    {
      id: 'disponibilidade',
      question: 'Como vejo os horários disponíveis?',
      answer: 'Escolha o serviço, o profissional e o dia na agenda. Os horários desta página são informações gerais da unidade; a agenda mostra a disponibilidade para a sua escolha, no horário de Brasília.',
    },
    {
      id: 'agendamentos',
      question: 'Onde acompanho meus agendamentos?',
      answer: 'Entre na sua conta e abra Meus Agendamentos para consultar os próximos atendimentos e o histórico. Na sua reserva, consulte as opções disponíveis para remarcar ou cancelar.',
    },
  ],
}
