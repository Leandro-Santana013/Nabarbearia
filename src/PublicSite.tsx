import {
  ArrowRight,
  ArrowUpRight,
  Brush,
  CalendarCheck,
  Check,
  Instagram,
  Layers,
  Menu,
  Phone,
  Scissors,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { siteConfig } from './config/siteConfig'
import { BarberPhoto } from './components/BarberPhoto'
import { api } from './services/api'
import { groupLandingServices } from './lib/landing-services'
import type { Barber, Service } from './types'
import { clearLandingIntent, saveLandingIntent, type LandingSelection } from './lib/booking/landing-intent'
import { landingContent } from './config/landingContent'
import { PublicFaq, PublicGallery, PublicPracticalInfo, PublicShopPhoto, PublicShopReel, PublicTestimonials } from './components/PublicContent'
import { publicImageProps, publicImageSizes } from './lib/public-media'

const serviceHighlights = [
  { id: 'cabelo', name: 'Cabelo', icon: Scissors, description: 'Um corte que acompanha seu estilo, do clássico ao visual que você quer experimentar.' },
  { id: 'barba', name: 'Barba', icon: Brush, description: 'Desenho, alinhamento e cuidado para dar o acabamento que faz a diferença.' },
  { id: 'combos', name: 'Combos', icon: Layers, description: 'Cabelo e barba na mesma visita. Conheça as combinações do catálogo.' },
] as const

const servicePrice = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

interface PublicSiteProps {
  onNavigate?: (path: string) => void
}

const externalLinkProps = { target: '_blank', rel: 'noopener noreferrer' } as const

function PlatformLink({ className = '', children, onNavigate }: { className?: string; children: ReactNode; onNavigate?: (path: string) => void }) {
  return <a className={className} href="/painel" onClick={(event) => { clearLandingIntent(); if (onNavigate) { event.preventDefault(); onNavigate('/painel') } }}>{children}</a>
}

function BrandSymbol({ loading = 'eager' }: { loading?: 'eager' | 'lazy' }) {
  return <span className="public-brand-symbol"><img {...publicImageProps('/brand/na-logo-cutout.png', publicImageSizes.symbol)} alt="Símbolo da NA Barbearia" width="1280" height="1280" loading={loading} decoding="async" /></span>
}

export default function PublicSite({ onNavigate }: PublicSiteProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [catalog, setCatalog] = useState<{ status: 'loading' | 'ready' | 'unavailable'; services: Service[] }>({ status: 'loading', services: [] })
  const [professionals, setProfessionals] = useState<{ status: 'loading' | 'ready' | 'unavailable'; barbers: Barber[] }>({ status: 'loading', barbers: [] })
  const [starting, setStarting] = useState(false)
  const startingRef = useRef(false)
  const mounted = useRef(true)
  const [choiceError, setChoiceError] = useState<{ message: string; source: 'service' | 'professional' } | null>(null)
  const headerRef = useRef<HTMLElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const [headerHidden, setHeaderHidden] = useState(false)
  const closeMenu = () => setMenuOpen(false)
  const serviceGroups = groupLandingServices(catalog.services)
  const catalogState = catalog.status === 'loading' ? 'loading' : catalog.status === 'ready' && Object.values(serviceGroups).some((services) => services.length > 0) ? 'success' : 'degraded'

  useEffect(() => {
    let current = true
    api.getPublicServices().then((services) => {
      if (current) setCatalog({ status: 'ready', services })
    }).catch(() => {
      if (current) setCatalog({ status: 'unavailable', services: [] })
    })
    api.getPublicBarbers().then((barbers) => {
      if (current) setProfessionals({ status: 'ready', barbers: barbers.filter((barber) => barber.active !== false) })
    }).catch(() => {
      if (current) setProfessionals({ status: 'unavailable', barbers: [] })
    })
    return () => { current = false }
  }, [])

  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  useEffect(() => {
    const main = document.querySelector('.public-site main')
    if (!main || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const targets = Array.from(main.querySelectorAll<HTMLElement>(
      '.public-hero-copy, .public-hero-art, .public-section-heading, .public-service-card, .public-team-story, .public-team-list-heading, .public-team-card, .public-how-grid > *, .public-testimonial-grid > figure, .public-visit-info, .public-visit-media, .public-faq-grid > *',
    ))
    targets.forEach((target, index) => {
      target.dataset.scrollReveal = 'hidden'
      target.style.setProperty('--scroll-reveal-delay', `${(index % 4) * 65}ms`)
    })

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.target instanceof HTMLElement) {
          entry.target.dataset.scrollReveal = entry.isIntersecting ? 'visible' : 'hidden'
        }
      })
    }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' })

    targets.forEach((target) => observer.observe(target))
    return () => {
      observer.disconnect()
      targets.forEach((target) => {
        delete target.dataset.scrollReveal
        target.style.removeProperty('--scroll-reveal-delay')
      })
    }
  }, [])

  async function beginChoice(selection: LandingSelection) {
    if (startingRef.current) return
    startingRef.current = true
    setStarting(true)
    setChoiceError(null)
    clearLandingIntent()
    try {
      // Check at the action, without loading authentication into the landing route.
      const auth = await api.authSession()
      if (!mounted.current) return
      if (!saveLandingIntent(selection, auth?.user.id ?? null)) throw new Error('Invalid selection')
      if (onNavigate) onNavigate('/agendar')
      else window.location.assign('/agendar')
    } catch {
      if (mounted.current) setChoiceError({ message: 'Não foi possível iniciar sua escolha. Confira a conexão e tente novamente.', source: selection.serviceId ? 'service' : 'professional' })
    } finally {
      startingRef.current = false
      if (mounted.current) setStarting(false)
    }
  }

  const team = professionals.barbers.length ? professionals.barbers.map((barber) => ({ ...barber, role: 'Barbeiro(a)', specialty: barber.specialty === 'Barbeiro(a)' ? undefined : barber.specialty })) : siteConfig.team.map((member) => ({ ...member, id: undefined }))

  useEffect(() => {
    const mobileViewport = window.matchMedia('(max-width: 1100px)')
    const resetMenu = () => setMenuOpen(false)
    mobileViewport.addEventListener('change', resetMenu)
    return () => mobileViewport.removeEventListener('change', resetMenu)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setMenuOpen(false)
      menuButtonRef.current?.focus()
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [menuOpen])

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let previousScrollY = window.scrollY
    let accumulatedScroll = 0
    const handleScroll = () => {
      const currentScrollY = window.scrollY
      const scrollDelta = currentScrollY - previousScrollY
      previousScrollY = currentScrollY

      if (currentScrollY <= 80) {
        accumulatedScroll = 0
        setHeaderHidden(false)
        return
      }

      if (menuOpen || headerRef.current?.contains(document.activeElement)) {
        accumulatedScroll = 0
        setHeaderHidden(false)
        return
      }

      accumulatedScroll = scrollDelta > 0
        ? Math.max(0, accumulatedScroll) + scrollDelta
        : Math.min(0, accumulatedScroll) + scrollDelta

      if (accumulatedScroll > 8) {
        setHeaderHidden(true)
        accumulatedScroll = 0
      } else if (accumulatedScroll < -8) {
        setHeaderHidden(false)
        accumulatedScroll = 0
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [menuOpen])

  return (
    <div className={`public-site${headerHidden && !menuOpen ? ' public-header-hidden' : ''}`}>
      <a className="public-skip-link" href="#conteudo-principal" onClick={closeMenu}>Pular para o conteúdo</a>
      <header ref={headerRef} className={`public-header${headerHidden && !menuOpen ? ' is-hidden' : ''}`} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) closeMenu() }}>
        <div className="public-header-inner">
        <a className="public-brand" href="#inicio" onClick={closeMenu} aria-label="NA Barbearia, início"><BrandSymbol /></a>
        <button ref={menuButtonRef} className="public-menu-button" type="button" aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'} aria-controls="public-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>
        <nav id="public-navigation" className={`public-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Navegação principal">
          <a href="#experiencia" onClick={closeMenu}>Serviços</a>
          <a href="#equipe" onClick={closeMenu}>Nossa equipe</a>
          <a href="#como-funciona" onClick={closeMenu}>Como agendar</a>
          <a href="#localizacao" onClick={closeMenu}>Localização</a>
          <a className="public-social-link" href={siteConfig.instagramUrl} {...externalLinkProps} onClick={closeMenu} aria-label="Instagram da NA Barbearia (abre em nova aba)" title="@nabarbeariaa"><Instagram size={21} aria-hidden="true" /></a>
          <PlatformLink onNavigate={onNavigate} className="public-nav-cta">Agendar horário <ArrowUpRight size={16} /></PlatformLink>
        </nav>
        </div>
      </header>

      <main id="conteudo-principal" tabIndex={-1}>
        <p className="sr-only" role="status">{starting ? 'Abrindo a agenda com sua escolha…' : ''}</p>
        <section className="public-hero" id="inicio" aria-labelledby="hero-title">
          <div className="public-container public-hero-grid">
            <div className="public-hero-copy">
              <span className="public-kicker"><span className="public-kicker-dot" /> Barbearia em {siteConfig.city}</span>
              <h1 id="hero-title"><span>BARBA,</span><span className="hero-line-accent">CABELO,</span><span>BIGODE,</span><span className="hero-line-accent">NA BARBEARIA</span></h1>
              <p>Cabelo, barba e cuidado com o seu visual. Um espaço para chegar, trocar uma ideia e sair com a sua identidade.</p>
              <div className="public-hero-actions"><PlatformLink onNavigate={onNavigate} className="public-button public-button-dark">Agendar horário <ArrowRight size={17} /></PlatformLink><a className="public-text-link" href="#localizacao">Ver localização <ArrowRight size={16} /></a></div>
              <p className="public-hero-note"><Check size={15} /> Entre ou crie sua conta para agendar.</p>
            </div>
            <div className="public-hero-art"><div className="public-hero-emblem"><img {...publicImageProps('/brand/na-logo-cutout.png', publicImageSizes.hero)} alt="Símbolo oficial da NA Barbearia" width="1280" height="1280" fetchPriority="high" decoding="async" /></div><a className="public-art-booking" href="#como-funciona"><CalendarCheck size={24} /><span>Seu próximo horário.<br /><strong>Veja como agendar</strong></span><ArrowUpRight size={20} /></a><span className="public-art-label">DO MACUCO, COM IDENTIDADE.</span></div>
          </div>
        </section>

        <section className="public-section public-services" id="experiencia" aria-labelledby="services-title">
          <div className="public-container">
            <div className="public-section-heading">
              <span className="public-eyebrow">Na cadeira</span>
              <h2 id="services-title">Qual é o seu próximo visual?</h2>
              <p>Do corte ao acabamento da barba, encontre o cuidado que combina com você.</p>
            </div>
            <div className="public-service-grid">
              {serviceHighlights.map(({ id, name, icon: Icon, description }) => <article className="public-service-card" data-category={id} key={id}>
                <div className="public-service-icon"><Icon size={24} aria-hidden="true" /></div>
                <h3>{name}</h3>
                <p>{description}</p>
                {serviceGroups[id].length > 0 ? <ul className="public-service-list">
                  {serviceGroups[id].map((service) => <li className="public-service-item" key={service.id}>
                    <div><strong>{service.name}</strong><span>{service.durationMinutes} min</span></div>
                    <span className="public-service-price">{servicePrice.format(service.priceCents / 100)}</span>
                    <button type="button" className="public-service-choice" data-service-id={service.id} disabled={starting} onClick={() => { void beginChoice({ serviceId: service.id }) }} aria-label={`Escolher serviço: ${service.name}`}>Escolher serviço <ArrowUpRight size={15} aria-hidden="true" /></button>
                  </li>)}
                </ul> : <p className="public-service-empty">Consulte as opções e os valores ao agendar.</p>}
                <PlatformLink onNavigate={onNavigate} className="public-card-link">Agendar horário <ArrowRight size={16} /></PlatformLink>
              </article>)}
            </div>
            <p className="public-catalog-note" role="status" data-state={catalogState}>
              {catalog.status === 'loading' ? 'Consultando valores e durações do catálogo…' : catalog.status === 'unavailable' ? 'Os valores não carregaram agora. Consulte o catálogo ao agendar.' : catalogState === 'success' ? 'Uma seleção do catálogo. Consulte todos os serviços e horários ao agendar.' : 'Consulte os serviços e valores disponíveis ao agendar.'}
            </p>
            {choiceError?.source === 'service' && <p className="public-choice-error" role="alert">{choiceError.message}</p>}
          </div>
        </section>
        <PublicGallery photos={landingContent.gallery} />
        <PublicShopReel />

        <section className="public-section public-team" id="equipe" aria-labelledby="team-title">
          <div className="public-container">
            <div className="public-team-story">
              <figure className="public-team-group">
                <img {...publicImageProps('/brand/na-team.webp', publicImageSizes.team)} alt="Equipe da NA Barbearia reunida na loja" width="1024" height="1024" loading="lazy" decoding="async" />
                <figcaption>NA BARBEARIA <span>Entre amigos, em Santos.</span></figcaption>
              </figure>
              <div className="public-team-intro">
                <span className="public-eyebrow">Nossa equipe</span>
                <h2 id="team-title">Quem cuida do seu <em>visual.</em></h2>
                <p className="public-team-lead">Tradição, técnica e resenha.</p>
                <p>Por trás de cada corte, tem alguém do nosso time. Gente que entende do assunto, escuta o que você quer e faz você se sentir em casa.</p>
                <PlatformLink onNavigate={onNavigate} className="public-button public-button-cyan">Agendar horário <ArrowUpRight size={18} /></PlatformLink>
                <span className="public-team-signature">Seu visual. A nossa história.</span>
              </div>
            </div>
            <div className="public-team-list-heading"><h3>Encontre seu barbeiro.</h3><p>Conheça o time e escolha com quem agendar.</p></div>
            <div className="public-team-grid">
              {team.map((member) => <article className="public-team-card" key={member.id ?? member.name}>
                <div className="public-team-photo"><BarberPhoto {...publicImageProps(member.photoUrl, publicImageSizes.portrait)} alt={`Foto de ${member.name}`} initials={member.name.slice(0, 2).toUpperCase()} loading="lazy" decoding="async" className="public-team-photo-image" fallbackClassName="public-team-photo-fallback" /></div>
                <div className="public-team-copy"><strong>{member.name}</strong><span>{member.role}</span>{member.specialty && <small>{member.specialty}</small>}</div>
                {member.id && <button type="button" className="public-professional-choice" data-barber-id={member.id} disabled={starting} onClick={() => { void beginChoice({ barberId: member.id }) }} aria-label={`Escolher este profissional: ${member.name}`}>Escolher este profissional <ArrowUpRight size={16} aria-hidden="true" /></button>}
              </article>)}
            </div>
            <p className="public-catalog-note" role="status">{professionals.status === 'loading' ? 'Consultando os profissionais disponíveis para agendar…' : professionals.barbers.length ? 'Sua escolha continua após entrar na conta. Os horários serão consultados na agenda.' : 'A escolha de profissional está disponível na agenda. Conheça nossa equipe acima.'}</p>
            {choiceError?.source === 'professional' && <p className="public-choice-error" role="alert">{choiceError.message}</p>}
          </div>
        </section>

        <section className="public-section public-how" id="como-funciona" aria-labelledby="how-title">
          <div className="public-container public-how-grid">
            <div className="public-section-heading">
              <span className="public-eyebrow">Como agendar</span>
              <h2 id="how-title">Seu horário, em três passos.</h2>
              <p>Escolha com calma. A agenda mostra os horários disponíveis.</p>
              <PlatformLink onNavigate={onNavigate} className="public-button public-button-blue">Agendar horário <ArrowRight size={17} /></PlatformLink>
            </div>
            <ol className="public-steps">
              <li><span>1</span><div><strong>Entre ou crie sua conta</strong><p>Acesse sua conta para continuar.</p></div></li>
              <li><span>2</span><div><strong>Escolha serviço e profissional</strong><p>Consulte as opções da unidade.</p></div></li>
              <li><span>3</span><div><strong>Confirme seu horário</strong><p>Confira os detalhes e confirme na agenda.</p></div></li>
            </ol>
          </div>
        </section>

        <PublicTestimonials testimonials={landingContent.testimonials} />

        <section className="public-section public-location" id="localizacao" aria-labelledby="location-title">
          <div className="public-container public-visit-grid">
            <div className="public-visit-info">
              <span className="public-eyebrow">Visite a unidade</span>
              <h2 id="location-title">A gente te espera no Macuco.</h2>
              <address>{siteConfig.address.street}<br />{siteConfig.address.neighborhood} · {siteConfig.address.city}/{siteConfig.address.state} · {siteConfig.address.postalCode}</address>
              <div className="location-actions"><a className="public-button public-button-dark" href={siteConfig.address.mapsUrl} {...externalLinkProps}>Como chegar <ArrowUpRight size={16} /></a></div>
              <div className="public-visit-hours">
                <h3>Horários da unidade</h3>
                <dl className="public-hours-list">
                  {siteConfig.hours.map((hours) => <div key={hours.days}><dt>{hours.label}</dt><dd>{hours.closed ? 'Fechado' : `${hours.open}–${hours.close}`}</dd></div>)}
                </dl>
                <p>Horários gerais de atendimento. Consulte a agenda para ver a disponibilidade de cada profissional.</p>
              </div>
              <div className="public-visit-contact">
                <a href={siteConfig.phoneHref}><Phone size={18} aria-hidden="true" /><span>{siteConfig.phone}</span></a>
                <a href={siteConfig.instagramUrl} {...externalLinkProps} aria-label="Instagram da NA Barbearia (abre em nova aba)"><Instagram size={18} aria-hidden="true" /><span>@nabarbeariaa</span></a>
              </div>
              <PublicPracticalInfo content={landingContent} />
            </div>
            <div className="public-visit-media">
              <PublicShopPhoto photo={landingContent.shopPhoto} />
              <div className="public-map-frame"><iframe title="Mapa da localização da NA Barbearia" src={siteConfig.mapEmbedUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" /></div>
            </div>
          </div>
        </section>

        <PublicFaq items={landingContent.faq} />
      </main>

      <footer className="public-footer"><div className="public-container public-footer-inner"><a className="public-brand" href="#inicio" aria-label="NA Barbearia, voltar ao início"><BrandSymbol loading="lazy" /></a><span>© {new Date().getFullYear()} NA Barbearia · Santos/SP</span><a className="public-social-link" href={siteConfig.instagramUrl} {...externalLinkProps} aria-label="Instagram da NA Barbearia (abre em nova aba)" title="@nabarbeariaa"><Instagram size={21} aria-hidden="true" /></a></div></footer>
    </div>
  )
}
