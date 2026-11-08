import { describe, expect, it } from 'vitest'
import { publicImageProps } from './public-media'

describe('imagens responsivas', () => {
  it('usa variantes WebP locais para fotos conhecidas da equipe', () => {
    const image = publicImageProps(
      'https://d39p7gjvbgwtet.cloudfront.net/Pessoas/original/p_foto_000412294.jpg?v=20241202131500',
      '40px',
    )

    expect(image).toMatchObject({
      src: '/brand/optimized/portrait-nailton-512.webp',
      srcSet: '/brand/optimized/portrait-nailton-256.webp 256w, /brand/optimized/portrait-nailton-512.webp 512w, /brand/optimized/portrait-nailton-768.webp 768w',
      sizes: '40px',
    })
  })

  it('preserva a URL original quando não existe variante conhecida', () => {
    const image = publicImageProps('https://example.com/avatar.jpg', '40px')

    expect(image).toEqual({ src: 'https://example.com/avatar.jpg' })
  })
})
