import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronDown, MessageCircle } from 'lucide-react'
import type { FocusEvent, KeyboardEvent, PointerEvent } from 'react'
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

function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(() => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ))

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mediaQuery.matches)
    const handleChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  return reducedMotion
}

function ContentImage({ photo, sizes = publicImageSizes.gallery, displayRatio, shouldLoad = true }: { photo: LandingPhoto; sizes?: string; displayRatio?: string; shouldLoad?: boolean }) {
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
  const shouldMountImage = nearViewport && shouldLoad
  return <div className="public-content-image" ref={containerRef} style={{ aspectRatio: displayRatio ?? `${photo.width} / ${photo.height}` }}>
    {failed ? <div className="public-content-image-fallback" role="img" aria-label={photo.alt}>Imagem indisponível</div>
      : shouldMountImage ? <img {...publicImageProps(photoSource(photo.src), sizes)} alt={photo.alt} width={photo.width} height={photo.height} loading="lazy" decoding="async" onError={() => setFailed(true)} />
        : <div className="public-content-image-placeholder" role="img" aria-label={photo.alt} />}
  </div>
}

export function PublicGallery({ photos }: { photos: readonly LandingGalleryPhoto[] }) {
  const visiblePhotos = photos.filter(validPhoto).slice(0, 8)
  const reducedMotion = usePrefersReducedMotion()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const paused = hovered || focusWithin

  useEffect(() => {
    if (paused || reducedMotion || visiblePhotos.length <= 1) return
    const timer = window.setInterval(() => {
      setCurrentIndex((index) => (index + 1) % visiblePhotos.length)
    }, 5500)
    return () => window.clearInterval(timer)
  }, [paused, reducedMotion, visiblePhotos.length])

  const moveTo = (index: number) => setCurrentIndex(index % visiblePhotos.length)
  const nextSlide = () => setCurrentIndex((index) => (index + 1) % visiblePhotos.length)
  const previousSlide = () => setCurrentIndex((index) => (index - 1 + visiblePhotos.length) % visiblePhotos.length)
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || visiblePhotos.length <= 1) return
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      previousSlide()
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      nextSlide()
    }
  }
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return
    touchStart.current = { x: event.clientX, y: event.clientY }
  }
  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = touchStart.current
    touchStart.current = null
    if (!start || event.pointerType !== 'touch') return
    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y
    if (Math.abs(deltaX) < 45 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return
    if (deltaX < 0) nextSlide()
    else previousSlide()
  }
  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocusWithin(false)
  }

  if (!visiblePhotos.length) return null
  const currentPhoto = visiblePhotos[currentIndex] ?? visiblePhotos[0]
  return <section className="public-section public-gallery" id="trabalhos" aria-labelledby="gallery-title">
    <div className="public-container">
      <div className="public-gallery-carousel-heading">
        <div className="public-section-heading"><span className="public-eyebrow">Referências de estilo</span><h2 id="gallery-title">Encontre seu próximo visual.</h2><p>{visiblePhotos.some((photo) => photo.illustrative) ? 'Inspirações de estilo e registros da barbearia. As imagens ilustrativas estão identificadas.' : 'Cortes e acabamentos feitos pela equipe da NA.'}</p></div>
      </div>
      <div
        className="public-gallery-carousel"
        role="region"
        aria-label="Galeria de fotos"
        aria-roledescription="carrossel"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { touchStart.current = null }}
        onFocusCapture={() => setFocusWithin(true)}
        onBlurCapture={handleBlur}
      >
        <p className="sr-only" aria-live="polite">{`Foto ${currentIndex + 1} de ${visiblePhotos.length}: ${currentPhoto.caption}`}</p>
        <div className="public-gallery-carousel-window">
          <div className="public-gallery-grid">
            {visiblePhotos.map((photo, index) => {
              const isCurrent = index === currentIndex
              const isPrevious = index === (currentIndex - 1 + visiblePhotos.length) % visiblePhotos.length
              const isNext = index === (currentIndex + 1) % visiblePhotos.length
              const position = isCurrent ? 'current' : isPrevious ? 'previous' : isNext ? 'next' : 'hidden'
              return <figure key={photo.id} className={`public-gallery-slide is-${position}`} role="group" aria-roledescription="slide" aria-label={`${index + 1} de ${visiblePhotos.length}`} aria-hidden={!isCurrent} aria-current={isCurrent ? 'true' : undefined} data-current={isCurrent}>
                <ContentImage key={photo.src} photo={photo} shouldLoad={isCurrent || isPrevious || isNext} />
                <figcaption>{photo.caption}{photo.illustrative && <span className="public-content-label">Imagem ilustrativa</span>}</figcaption>
              </figure>
            })}
          </div>
        </div>
        <div className="public-gallery-pagination" role="group" aria-label="Selecionar foto">
          {visiblePhotos.map((_, index) => <button
            key={index}
            type="button"
            className="public-gallery-dot"
            aria-label={`Mostrar foto ${index + 1}`}
            aria-current={currentIndex === index ? 'true' : undefined}
            onClick={() => moveTo(index)}
          />)}
        </div>
        <div className="public-gallery-controls" aria-label="Controles da galeria">
          <button type="button" className="public-gallery-arrow" onClick={previousSlide} aria-label="Foto anterior"><ArrowLeft size={20} /></button>
          <span className="public-gallery-count" aria-hidden="true">{String(currentIndex + 1).padStart(2, '0')} <span>/</span> {String(visiblePhotos.length).padStart(2, '0')}</span>
          <button type="button" className="public-gallery-arrow" onClick={nextSlide} aria-label="Próxima foto"><ArrowRight size={20} /></button>
        </div>
      </div>
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
  return <figure className="public-shop-photo"><ContentImage key={photo.src} photo={photo} sizes={publicImageSizes.shop} displayRatio="3 / 2" /><figcaption>{photo.caption}{photo.illustrative && <span className="public-content-label">Imagem ilustrativa · não representa a unidade</span>}</figcaption></figure>
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
        <p><span>{item.answer}</span></p>
      </details>)}</div>
    </div>
  </section>
}
