import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, ChevronDown, MessageCircle } from 'lucide-react'
import type { LandingContent, LandingFaq, LandingGalleryPhoto, LandingPhoto, LandingTestimonial } from '../config/landingContent'
import { publicImageProps, publicImageSizes } from '../lib/public-media'

const externalLinkProps = { target: '_blank', rel: 'noopener noreferrer' } as const

function httpsUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined
  } catch { return undefined }
}

function photoSource(value: string): string | undefined {
  const remote = httpsUrl(value)
  if (remote) return remote
  if (!value.startsWith('/')) return undefined
  try {
    const url = new URL(value, 'https://local.invalid')
    return url.origin === 'https://local.invalid' ? `${url.pathname}${url.search}` : undefined
  } catch { return undefined }
}

function validPhoto(photo: LandingPhoto): boolean {
  return Boolean(photoSource(photo.src) && photo.alt.trim() && photo.caption.trim()
    && Number.isSafeInteger(photo.width) && photo.width > 0
    && Number.isSafeInteger(photo.height) && photo.height > 0)
}

function ContentImage({ photo, sizes = publicImageSizes.gallery }: { photo: LandingPhoto; sizes?: string }) {
  const [failed, setFailed] = useState(false)
  const [nearViewport, setNearViewport] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!('IntersectionObserver' in window)) { setNearViewport(true); return }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setNearViewport(true)
        observer.disconnect()
      }
    }, { rootMargin: '240px' })
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])
  return <div className="public-content-image" ref={containerRef} style={{ aspectRatio: `${photo.width} / ${photo.height}` }}>
    {failed ? <div className="public-content-image-fallback" role="img" aria-label={photo.alt}>Imagem indisponível</div>
      : nearViewport ? <img {...publicImageProps(photoSource(photo.src), sizes)} alt={photo.alt} width={photo.width} height={photo.height} loading="lazy" decoding="async" onError={() => setFailed(true)} />
        : <div className="public-content-image-placeholder" role="img" aria-label={photo.alt} />}
  </div>
}

export function PublicGallery({ photos }: { photos: readonly LandingGalleryPhoto[] }) {
  const visiblePhotos = photos.filter(validPhoto).slice(0, 8)
  if (!visiblePhotos.length) return null
  return <section className="public-section public-gallery" id="trabalhos" aria-labelledby="gallery-title">
    <div className="public-container">
      <div className="public-section-heading"><span className="public-eyebrow">Referências de estilo</span><h2 id="gallery-title">Encontre seu próximo visual.</h2><p>{visiblePhotos.some((photo) => photo.illustrative) ? 'Imagens ilustrativas temporárias. Em breve, este espaço recebe os trabalhos reais da equipe.' : 'Cortes e acabamentos feitos pela equipe da NA.'}</p></div>
      <div className="public-gallery-grid">{visiblePhotos.map((photo) => <figure key={photo.id}>
        <ContentImage key={photo.src} photo={photo} />
        <figcaption>{photo.caption}{photo.illustrative && <span className="public-content-label">Imagem ilustrativa</span>}</figcaption>
      </figure>)}</div>
    </div>
  </section>
}

export function PublicTestimonials({ testimonials }: { testimonials: readonly LandingTestimonial[] }) {
  const visibleTestimonials = testimonials.filter((item) => item.quote.trim() && item.author.trim() && (item.kind === 'illustrative' || (item.sourceLabel.trim() && httpsUrl(item.sourceUrl)))).slice(0, 3)
  if (!visibleTestimonials.length) return null
  return <section className="public-section public-testimonials" aria-labelledby="testimonials-title">
    <div className="public-container">
      <div className="public-section-heading"><span className="public-eyebrow">Experiência em palavras</span><h2 id="testimonials-title">{visibleTestimonials.some((item) => item.kind === 'illustrative') ? 'Como pode ser a sua visita.' : 'A experiência, por quem viveu.'}</h2>{visibleTestimonials.some((item) => item.kind === 'illustrative') && <p>Os relatos abaixo identificados como exemplos são fictícios, usados para demonstrar esta seção. Não são avaliações de clientes.</p>}</div>
      <div className="public-testimonial-grid">{visibleTestimonials.map((item) => <figure key={item.id}>
        <blockquote><p>{item.quote}</p></blockquote>
        <figcaption><strong>{item.author}</strong>{item.kind === 'illustrative' ? <span className="public-content-label">Relato fictício · exemplo</span> : <a href={httpsUrl(item.sourceUrl)} {...externalLinkProps} aria-label={`Conferir avaliação de ${item.author} em ${item.sourceLabel} (abre em nova aba)`}>{item.sourceLabel} <ArrowUpRight size={15} aria-hidden="true" /></a>}</figcaption>
      </figure>)}</div>
    </div>
  </section>
}

export function PublicShopPhoto({ photo }: { photo?: LandingPhoto }) {
  if (!photo || !validPhoto(photo)) return null
  return <figure className="public-shop-photo"><ContentImage key={photo.src} photo={photo} sizes={publicImageSizes.shop} /><figcaption>{photo.caption}{photo.illustrative && <span className="public-content-label">Imagem ilustrativa · não representa a unidade</span>}</figcaption></figure>
}

export function PublicPracticalInfo({ content }: { content: Pick<LandingContent, 'paymentMethods' | 'amenities' | 'whatsappNumber'> }) {
  const payments = content.paymentMethods.filter((item) => item.trim())
  const amenities = content.amenities.filter((item) => item.trim())
  // Store only an explicitly confirmed international number, without punctuation.
  const whatsapp = content.whatsappNumber && /^[1-9]\d{9,14}$/.test(content.whatsappNumber) ? `https://wa.me/${content.whatsappNumber}` : undefined
  if (!payments.length && !amenities.length && !whatsapp) return null
  return <div className="public-practical-info">
    {payments.length > 0 && <div><h3>Formas de pagamento</h3><ul>{payments.map((item) => <li key={item}>{item}</li>)}</ul></div>}
    {amenities.length > 0 && <div><h3>Na unidade</h3><ul>{amenities.map((item) => <li key={item}>{item}</li>)}</ul></div>}
    {whatsapp && <a className="public-text-link public-whatsapp-link" href={whatsapp} {...externalLinkProps} aria-label="Tirar uma dúvida pelo WhatsApp (abre em nova aba)"><MessageCircle size={18} aria-hidden="true" /> Tirar uma dúvida <ArrowUpRight size={15} aria-hidden="true" /></a>}
  </div>
}

export function PublicFaq({ items }: { items: readonly LandingFaq[] }) {
  const questions = items.filter((item) => item.question.trim() && item.answer.trim())
  if (!questions.length) return null
  return <section className="public-section public-faq" id="duvidas" aria-labelledby="faq-title">
    <div className="public-container public-faq-grid">
      <div className="public-section-heading"><span className="public-eyebrow">Dúvidas frequentes</span><h2 id="faq-title">Antes da sua visita.</h2><p>O que você precisa saber para encontrar seu próximo horário.</p></div>
      <div className="public-faq-list">{questions.map((item) => <details key={item.id}>
        <summary>{item.question}<ChevronDown size={18} aria-hidden="true" /></summary>
        <p>{item.answer}</p>
      </details>)}</div>
    </div>
  </section>
}
