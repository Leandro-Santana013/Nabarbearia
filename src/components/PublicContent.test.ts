import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PublicGallery, PublicPracticalInfo, PublicShopPhoto, PublicTestimonials } from './PublicContent'

const photo = { src: '/brand/photo-approved.webp', alt: 'Descrição da foto', caption: 'Legenda confirmada', width: 800, height: 1000 }
const testimonial = { id: 'review', kind: 'verified' as const, author: 'Cliente de teste', quote: 'Relato de teste <script>alert(1)</script>', sourceLabel: 'Fonte de teste', sourceUrl: 'https://example.com/review' }

describe('conteúdo público opcional', () => {
  it('não cria blocos vazios sem os materiais confirmados', () => {
    expect(renderToStaticMarkup(createElement(PublicGallery, { photos: [] }))).toBe('')
    expect(renderToStaticMarkup(createElement(PublicTestimonials, { testimonials: [] }))).toBe('')
    expect(renderToStaticMarkup(createElement(PublicShopPhoto))).toBe('')
    expect(renderToStaticMarkup(createElement(PublicPracticalInfo, { content: { paymentMethods: [], amenities: [] } }))).toBe('')
  })

  it('exige fonte HTTPS válida nos depoimentos e escapa o relato como texto', () => {
    const invalid = ['javascript:alert(1)', 'http://example.com/review', 'https://user:password@example.com/review', '']
    for (const sourceUrl of invalid) {
      expect(renderToStaticMarkup(createElement(PublicTestimonials, { testimonials: [{ ...testimonial, sourceUrl }] }))).toBe('')
    }
    const html = renderToStaticMarkup(createElement(PublicTestimonials, { testimonials: [testimonial] }))
    expect(html).toContain('href="https://example.com/review"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('identifica conteúdo fictício sem atribuir fonte ou avaliação real', () => {
    const html = renderToStaticMarkup(createElement(PublicTestimonials, { testimonials: [{ id: 'demo', kind: 'illustrative', author: 'Cliente exemplo', quote: 'Texto ilustrativo.' }] }))
    expect(html).toContain('Relato fictício')
    expect(html).toContain('Não são avaliações de clientes.')
    expect(html).not.toContain('Conferir avaliação')
    const image = renderToStaticMarkup(createElement(PublicShopPhoto, { photo: { ...photo, illustrative: true } }))
    expect(image).toContain('não representa a unidade')
  })

  it('não carrega fotos de protocolos inválidos ou caminhos que desviem para outro domínio', () => {
    for (const src of ['javascript:alert(1)', 'data:image/svg+xml,test', '//example.com/photo.jpg', '/\\example.com/photo.jpg', 'http://example.com/photo.jpg']) {
      expect(renderToStaticMarkup(createElement(PublicGallery, { photos: [{ ...photo, id: 'image', src }] }))).toBe('')
    }
    const html = renderToStaticMarkup(createElement(PublicGallery, { photos: [{ ...photo, id: 'image' }] }))
    expect(html).toContain('aria-label="Descrição da foto"')
    expect(html).toContain('aspect-ratio:800 / 1000')
    expect(html).not.toContain('<img')
  })

  it('omite imagem sem descrição ou dimensão utilizável', () => {
    for (const invalidPhoto of [{ ...photo, alt: '' }, { ...photo, width: 0 }, { ...photo, height: Number.NaN }]) {
      expect(renderToStaticMarkup(createElement(PublicShopPhoto, { photo: invalidPhoto }))).toBe('')
    }
  })

  it('usa somente informações fornecidas e valida o destino de contato', () => {
    const content = { paymentMethods: ['Pix'], amenities: ['Wi-Fi'], whatsappNumber: '5513974040190' }
    const html = renderToStaticMarkup(createElement(PublicPracticalInfo, { content }))
    expect(html).toContain('href="https://wa.me/5513974040190"')
    expect(html).toContain('Pix')
    expect(html).toContain('Wi-Fi')
    expect(html).not.toContain('Cartão')
    expect(html).not.toContain('reserva confirmada')
    expect(renderToStaticMarkup(createElement(PublicPracticalInfo, { content: { paymentMethods: [], amenities: [], whatsappNumber: 'javascript:alert(1)' } }))).toBe('')
  })
})
