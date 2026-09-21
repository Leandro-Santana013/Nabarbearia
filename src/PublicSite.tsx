import {
  ArrowUpRight,
  CalendarArrowUp,
  Check,
  ChevronRight,
  Clock3,
  Instagram,
  MapPin,
  Menu,
  Phone,
  Scissors,
  Sparkles,
  X,
} from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { siteConfig } from './config/siteConfig'

const externalLinkProps = {
  target: '_blank',
  rel: 'noopener noreferrer',
} as const

function BookingLink({ className = '', children = 'Agendar horário' }: { className?: string; children?: ReactNode }) {
  return <a className={className} href={siteConfig.bookingUrl} {...externalLinkProps}>{children}<ArrowUpRight size={16} aria-hidden="true" /></a>
}

export default function PublicSite() {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)

  return (
    <div className="public-site">
      <header className="public-header">
        <a className="public-brand" href="#inicio" onClick={closeMenu} aria-label={`${siteConfig.brandName}, início`}>
          <span className="public-brand-mark" aria-hidden="true"><Scissors size={19} strokeWidth={2.4} /></span>
          <span><strong>NA</strong> Barbearia</span>
        </a>
        <button className="public-menu-button" type="button" aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen((current) => !current)}>
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
        <nav className={`public-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Navegação principal">
          <a href="#experiencia" onClick={closeMenu}>Experiência</a>
          <a href="#como-agendar" onClick={closeMenu}>Como agendar</a>
          <a href="#localizacao" onClick={closeMenu}>Localização</a>
          <a href={siteConfig.instagramUrl} {...externalLinkProps} onClick={closeMenu}>Instagram <ArrowUpRight size={13} aria-hidden="true" /></a>
          <BookingLink className="public-nav-cta">Agendar horário</BookingLink>
        </nav>
      </header>

      <main>
        <section className="public-hero" id="inicio" aria-labelledby="public-hero-title">
          <div className="public-container public-hero-grid">
            <div className="public-hero-copy">
              <span className="public-kicker"><span className="public-kicker-dot" aria-hidden="true" /> Barbearia em {siteConfig.city}</span>
              <h1 id="public-hero-title"><span className="public-hero-line-dark">BARBA,</span><span>CABELO,</span><span className="public-hero-line-dark">BIGODE,</span><span>NA BARBEARIA</span></h1>
              <p>Na NA Barbearia, você encontra um espaço para cuidar do visual com praticidade. Consulte a agenda oficial e escolha seu horário pelo Trinks.</p>
              <div className="public-hero-actions">
                <BookingLink className="public-button public-button-dark">Agendar horário</BookingLink>
                <a className="public-text-link" href="#localizacao">Ver localização <ChevronRight size={16} aria-hidden="true" /></a>
              </div>
              <p className="public-hero-note"><Check size={15} aria-hidden="true" /> Agenda, disponibilidade e confirmação acontecem no Trinks.</p>
            </div>
            <div className="public-hero-art" aria-label="Ilustração abstrata da NA Barbearia, sem uso de fotografia">
              <div className="public-art-glow" aria-hidden="true" />
              <div className="public-art-card public-art-card-main"><Scissors size={41} strokeWidth={1.6} aria-hidden="true" /><span>NA</span><strong>BARBEARIA</strong></div>
              <div className="public-art-card public-art-card-small"><Sparkles size={18} aria-hidden="true" /><span>Seu próximo<br />horário começa aqui.</span></div>
              <span className="public-art-label">SANTOS · SP</span>
            </div>
          </div>
        </section>

        <section className="public-trust-row" aria-label="Informações rápidas">
          <div><MapPin size={18} aria-hidden="true" /><span><strong>{siteConfig.address.neighborhood}, {siteConfig.address.city}</strong><small>Endereço verificado</small></span></div>
          <div><Clock3 size={18} aria-hidden="true" /><span><strong>Horários publicados</strong><small>Consulte a agenda no Trinks</small></span></div>
          <div><CalendarArrowUp size={18} aria-hidden="true" /><span><strong>Agendamento online</strong><small>Disponibilidade no Trinks</small></span></div>
        </section>

        <section className="public-section public-experience" id="experiencia" aria-labelledby="experience-title">
          <div className="public-container">
            <div className="public-section-heading"><span className="public-eyebrow">01 · a experiência</span><h2 id="experience-title">Uma visita simples de marcar.</h2><p>A NA Barbearia está em Santos/SP. Para consultar disponibilidade e organizar sua visita, use o canal oficial de agendamento.</p></div>
            <div className="public-feature-grid">
              <article className="public-feature-card public-feature-card-highlight"><span className="public-feature-index">01</span><div className="public-feature-icon"><CalendarArrowUp size={21} aria-hidden="true" /></div><h3>Escolha seu horário</h3><p>O Trinks mostra a agenda disponível para você escolher o melhor momento.</p><BookingLink className="public-card-link">Ir para a agenda</BookingLink></article>
              <article className="public-feature-card"><span className="public-feature-index">02</span><div className="public-feature-icon"><Clock3 size={21} aria-hidden="true" /></div><h3>Tenha clareza</h3><p>Confirmações, disponibilidade, remarcações e cancelamentos são tratados no Trinks.</p></article>
              <article className="public-feature-card"><span className="public-feature-index">03</span><div className="public-feature-icon"><MapPin size={21} aria-hidden="true" /></div><h3>Chegue até nós</h3><p>Consulte endereço, telefone e horários oficiais antes de sair de casa.</p></article>
            </div>
          </div>
        </section>

        <section className="public-section public-how" id="como-agendar" aria-labelledby="how-title">
          <div className="public-container public-how-grid">
            <div className="public-section-heading"><span className="public-eyebrow">02 · como agendar</span><h2 id="how-title">Tudo acontece no canal oficial.</h2><p>Este site apresenta a NA Barbearia. A agenda é externa: o Trinks concentra a disponibilidade e as ações do seu agendamento.</p><BookingLink className="public-button public-button-blue">Abrir Trinks</BookingLink></div>
            <ol className="public-steps">
              <li><span>1</span><div><strong>Abra o Trinks</strong><p>Use o botão de agendamento e acesse a página oficial da NA Barbearia.</p></div></li>
              <li><span>2</span><div><strong>Consulte a disponibilidade</strong><p>Escolha a opção disponível para a sua visita diretamente na plataforma.</p></div></li>
              <li><span>3</span><div><strong>Gerencie por lá</strong><p>Confirmação, remarcação e cancelamento são realizados no próprio Trinks.</p></div></li>
            </ol>
          </div>
        </section>

        <section className="public-section public-location" id="localizacao" aria-labelledby="location-title">
          <div className="public-container public-location-grid">
            <div className="public-location-card"><div className="public-location-card-top"><span className="public-eyebrow">03 · encontre a gente</span><div className="public-map-mark"><MapPin size={22} aria-hidden="true" /></div></div><h2 id="location-title">NA Barbearia<br /><span>em Santos.</span></h2><p className="public-address">{siteConfig.address.street}<br />{siteConfig.address.neighborhood}, {siteConfig.address.city} — {siteConfig.address.state}<br />{siteConfig.address.postalCode}</p><a className="public-card-link" href={siteConfig.address.mapsUrl} {...externalLinkProps}>Abrir no mapa <ArrowUpRight size={15} aria-hidden="true" /></a></div>
            <div className="public-contact-details"><div className="public-section-heading"><span className="public-eyebrow">Informações oficiais</span><h2>Programe sua visita.</h2><p>Confira os dados públicos antes de abrir a agenda.</p></div><a className="public-contact-row" href={siteConfig.phoneHref}><span className="public-contact-icon"><Phone size={18} aria-hidden="true" /></span><span><small>Telefone</small><strong>{siteConfig.phone}</strong></span><ChevronRight size={16} aria-hidden="true" /></a><div className="public-hours"><div className="public-contact-icon"><Clock3 size={18} aria-hidden="true" /></div><div><small>Horários publicados</small>{siteConfig.hours.map((item) => <div className="public-hour-row" key={item.days}><span>{item.label}</span><strong>{item.open} — {item.close}</strong></div>)}</div></div><p className="public-data-note"><Check size={14} aria-hidden="true" /> Sábado não está publicado aqui porque o horário disponível é ambíguo.</p></div>
          </div>
        </section>

        <section className="public-cta-section" aria-labelledby="cta-title"><div className="public-container public-cta-inner"><div><span className="public-eyebrow">Pronto para marcar?</span><h2 id="cta-title">Seu próximo horário começa no Trinks.</h2></div><BookingLink className="public-button public-button-white">Agendar horário</BookingLink></div></section>
      </main>

      <footer className="public-footer"><div className="public-container public-footer-inner"><div><a className="public-brand public-brand-footer" href="#inicio"><span className="public-brand-mark" aria-hidden="true"><Scissors size={17} /></span><span><strong>NA</strong> Barbearia</span></a><p>Barbearia em {siteConfig.city}.</p></div><div className="public-footer-links"><a href={siteConfig.instagramUrl} {...externalLinkProps}><Instagram size={16} aria-hidden="true" /> Instagram <ArrowUpRight size={13} aria-hidden="true" /></a><a href={siteConfig.phoneHref}><Phone size={16} aria-hidden="true" /> {siteConfig.phone}</a></div><p className="public-footer-disclaimer">Agenda e disponibilidade no Trinks.</p></div></footer>
      <BookingLink className="public-mobile-cta">Agendar horário</BookingLink>
    </div>
  )
}
