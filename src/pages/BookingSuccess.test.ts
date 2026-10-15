import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import BookingSuccess from './BookingSuccess.jsx'
import { DEFAULT_SERVICE, DEFAULT_BARBER } from '@/data/bookingCatalog'
import type { BookingSuccessProps } from './BookingSuccess.types'

const booking = { service: DEFAULT_SERVICE, barber: DEFAULT_BARBER, date: '2026-11-05', time: '16:00' }
const render = (props: BookingSuccessProps = {}) => renderToStaticMarkup(createElement<BookingSuccessProps>(BookingSuccess, { booking, ...props }))

describe('comprovante de agendamento', () => {
  it('mostra as escolhas recebidas, sem substituir pelo exemplo padrão', () => {
    const html = render({
      booking: {
        service: { title: 'Barba', price: 'R$ 45,00', duration: '30 min' },
        barber: { id: 'nailton', name: 'Nailton', specialty: 'Barbeiro(a)' },
        date: '2026-11-05', time: '16:15',
      },
    })
    expect(html).toContain('Barba')
    expect(html).toContain('Nailton')
    expect(html).toContain('R$ 45,00')
    expect(html).toContain('5 de novembro de 2026 às 16:15')
    expect(html).not.toContain('Sorriso')
  })

  it('identifica a demonstração e não anuncia envio real de WhatsApp', () => {
    const html = render({ whatsappStatus: 'sent' })
    expect(html).toContain('Demonstração')
    expect(html).not.toContain('Lembrete enviado!')
  })

  it('exibe a mensagem de envio somente para confirmação real informada', () => {
    const html = render({ isDemo: false, whatsappStatus: 'sent' })
    expect(html).toContain('Lembrete enviado!')
    expect(html).toContain('Seu horário foi reservado com sucesso')
    expect(html).not.toContain('Demonstração')
  })

  it('distingue falha na notificação de falha no agendamento', () => {
    const html = render({ isDemo: false, whatsappStatus: 'failed' })
    expect(html).toContain('Não foi possível enviar pelo WhatsApp')
    expect(html).toContain('Seu agendamento continua confirmado')
    expect(html).not.toContain('Lembrete enviado!')
  })
  it('não inventa um comprovante quando nenhum agendamento é informado', () => {
    const html = render({ booking: undefined })
    expect(html).toContain('Nenhum agendamento confirmado')
    expect(html).not.toContain('Agendamento Confirmado!')
  })

  it('leva serviço, preço, duração e profissional reais para a mensagem de WhatsApp', () => {
    const html = render()
    const href = html.match(/href="(https:\/\/wa\.me\/[^"]+)"/)?.[1]
    expect(href).toBeDefined()
    const url = new URL(href!)
    expect(url.pathname).toBe('/5513974040190')
    const message = url.searchParams.get('text')!
    expect(message).toContain(`Serviço: ${DEFAULT_SERVICE.title}`)
    expect(message).toContain(`Valor: ${DEFAULT_SERVICE.price}`)
    expect(message).toContain(`Duração: ${DEFAULT_SERVICE.duration}`)
    expect(message).toContain(`Profissional: ${DEFAULT_BARBER.name}`)
    expect(message).toContain('\nServiço:')
  })

})
