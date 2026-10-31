import {
  ArrowRight,
  ArrowUpRight,
  CalendarCheck,
  Check,
  Clock3,
  Instagram,
  MapPin,
  Menu,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { siteConfig } from './config/siteConfig'
import { BarberPhoto } from './components/BarberPhoto'

interface PublicSiteProps {
  onNavigate?: (path: string) => void
}

const externalLinkProps = { target: '_blank', rel: 'noopener noreferrer' } as const

function PlatformLink({ className = '', children, onNavigate }: { className?: string; children: ReactNode; onNavigate?: (path: string) => void }) {
  return <a className={className} href="/painel" onClick={(event) => { if (onNavigate) { event.preventDefault(); onNavigate('/painel') } }}>{children}</a>
}

function BrandSymbol() {
  return <span className="public-brand-symbol"><img src="/brand/na-logo-cutout.png" alt="Símbolo da NA Barbearia" width="1280" height="1280" /></span>
}

export default function PublicSite({ onNavigate }: PublicSiteProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)

  return (
    <div className="public-site">
      <header className="public-header">
        <a className="public-brand" href="#inicio" onClick={closeMenu} aria-label="NA Barbearia, início"><BrandSymbol /></a>
        <button className="public-menu-button" type="button" aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'} aria-controls="public-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>
        <nav id="public-navigation" onKeyDown={(event) => { if (event.key === 'Escape') { closeMenu(); document.querySelector<HTMLButtonElement>('.public-menu-button')?.focus() } }} className={`public-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Navegação principal">
          <a href="#experiencia" onClick={closeMenu}>Experiência</a>
          <a href="#como-funciona" onClick={closeMenu}>Como funciona</a>
          <a href="#localizacao" onClick={closeMenu}>Localização</a>
          <a href="#equipe" onClick={closeMenu}>Nossa equipe</a>
          <a className="public-social-link" href={siteConfig.instagramUrl} {...externalLinkProps} onClick={closeMenu} aria-label="Instagram da NA Barbearia (abre em nova aba)" title="@nabarbeariaa"><Instagram size={21} aria-hidden="true" /></a>
          <PlatformLink onNavigate={onNavigate} className="public-nav-cta">Agendar horário <ArrowUpRight size={16} /></PlatformLink>
        </nav>
      </header>

      <main>
        <section className="public-hero" id="inicio" aria-labelledby="hero-title">
          <div className="public-container public-hero-grid">
            <div className="public-hero-copy">
              <span className="public-kicker"><span className="public-kicker-dot" /> Barbearia em {siteConfig.city}</span>
              <h1 id="hero-title"><span>BARBA,</span><span className="hero-line-accent">CABELO,</span><span>BIGODE,</span><span className="hero-line-accent">NA BARBEARIA</span></h1>
              <p>Um espaço para cuidar do visual com praticidade, atendimento próximo e uma agenda que acompanha a sua rotina.</p>
              <div className="public-hero-actions"><PlatformLink onNavigate={onNavigate} className="public-button public-button-dark">Agendar horário <ArrowRight size={17} /></PlatformLink><a className="public-text-link" href="#localizacao">Ver localização <ArrowRight size={16} /></a></div>
              <p className="public-hero-note"><Check size={15} /> Consulte serviços e horários disponíveis na plataforma.</p>
            </div>
            <div className="public-hero-art"><div className="public-hero-emblem"><img src="/brand/na-logo-cutout.png" alt="Símbolo oficial da NA Barbearia" width="1280" height="1280" /></div><a className="public-art-booking" href="#como-funciona"><CalendarCheck size={24} /><span>Seu estilo.<br /><strong>Seu próximo horário.</strong></span><ArrowUpRight size={20} /></a><span className="public-art-label">DO MACUCO, COM IDENTIDADE.</span></div>
          </div>
        </section>

        <section className="public-trust-row" aria-label="Informações rápidas"><div><MapPin size={18} /><span><strong>{siteConfig.address.neighborhood}, {siteConfig.address.city}</strong><small>Endereço da unidade</small></span></div><div><Clock3 size={18} /><span><strong>Horários de atendimento</strong><small>Consulte a agenda atualizada</small></span></div><div><ShieldCheck size={18} /><span><strong>Plataforma segura</strong><small>Seus dados ficam protegidos</small></span></div></section>

        <section className="public-section" id="experiencia" aria-labelledby="experience-title"><div className="public-container"><div className="public-section-heading"><span className="public-eyebrow">A experiência</span><h2 id="experience-title">Uma visita simples de marcar.</h2><p>Na NA Barbearia você escolhe o serviço, consulta a disponibilidade da equipe e acompanha tudo pela sua conta.</p></div><div className="public-feature-grid"><article className="public-feature-card public-feature-card-highlight"><div className="public-feature-icon"><CalendarCheck size={21} /></div><h3>Escolha seu horário</h3><p>Veja os horários disponíveis e escolha o melhor para você.</p><PlatformLink onNavigate={onNavigate} className="public-card-link">Ir para a agenda <ArrowRight size={15} /></PlatformLink></article><article className="public-feature-card"><div className="public-feature-icon"><Clock3 size={21} /></div><h3>Tenha clareza</h3><p>Consulte seus agendamentos, status e histórico em uma única tela.</p></article><article className="public-feature-card"><div className="public-feature-icon"><ShieldCheck size={21} /></div><h3>Dados protegidos</h3><p>Acesse sua conta com segurança para consultar e gerenciar seus horários.</p></article></div></div></section>

        <section className="public-section public-how" id="como-funciona" aria-labelledby="how-title"><div className="public-container public-how-grid"><div className="public-section-heading"><span className="public-eyebrow">Como funciona</span><h2 id="how-title">Do primeiro clique ao atendimento.</h2><p>A plataforma conecta a agenda, a equipe e o seu histórico de forma objetiva.</p><PlatformLink onNavigate={onNavigate} className="public-button public-button-blue">Acessar plataforma <ArrowRight size={17} /></PlatformLink></div><ol className="public-steps"><li><span>1</span><div><strong>Crie ou acesse sua conta</strong><p>O cadastro de cliente é feito pela própria plataforma.</p></div></li><li><span>2</span><div><strong>Selecione serviço e profissional</strong><p>Escolha a combinação que faz sentido para você.</p></div></li><li><span>3</span><div><strong>Confirme seu horário</strong><p>Confira os detalhes e reserve um horário disponível.</p></div></li></ol></div></section>

        <section className="public-section public-location" id="localizacao" aria-labelledby="location-title"><div className="public-container location-grid"><div><span className="public-eyebrow">Localização</span><h2 id="location-title">Encontre a NA Barbearia.</h2><p>{siteConfig.address.street}<br />{siteConfig.address.neighborhood} · {siteConfig.address.city}/{siteConfig.address.state} · {siteConfig.address.postalCode}</p><div className="location-actions"><a className="public-button public-button-dark" href={siteConfig.address.mapsUrl} {...externalLinkProps}>Abrir no mapa <ArrowUpRight size={16} /></a><a className="public-text-link" href={siteConfig.phoneHref}>Ligar para a unidade <ArrowRight size={16} /></a></div></div><div className="location-card"><MapPin size={26} /><strong>{siteConfig.phone}</strong><span>{siteConfig.hours.map((item) => `${item.label}: ${item.closed ? "Fechado" : `${item.open}–${item.close}`}`).join(' · ')}</span><a href={siteConfig.instagramUrl} {...externalLinkProps}><Instagram size={16} /> @nabarbeariaa</a></div></div></section>
        <section className="public-section public-team" id="equipe" aria-labelledby="team-title">
          <div className="public-container">
            <div className="public-team-story">
              <figure className="public-team-group">
                <img src="/brand/na-team.webp" alt="Equipe da NA Barbearia reunida na loja" width="1024" height="1024" loading="lazy" />
                <figcaption>NA BARBEARIA <span>Entre amigos, em Santos.</span></figcaption>
              </figure>
              <div className="public-team-intro">
                <span className="public-eyebrow">Nossa equipe</span>
                <h2 id="team-title">Quem cuida{' '}<br />do seu <em>visual.</em></h2>
                <p className="public-team-lead">Tradição, técnica e resenha.</p>
                <p>Por trás de cada corte, tem alguém do nosso time. Gente que entende do assunto, escuta o que você quer e faz você se sentir em casa.</p>
                <PlatformLink onNavigate={onNavigate} className="public-button public-button-cyan">Escolher meu profissional <ArrowUpRight size={18} /></PlatformLink>
                <span className="public-team-signature">Seu visual. A nossa história.</span>
              </div>
            </div>
            <div className="public-team-list-heading"><h3>Encontre seu barbeiro.</h3><p>Conheça o time e escolha com quem agendar.</p></div>
            <div className="public-team-grid">
              {siteConfig.team.map((member) => <article className="public-team-card" key={member.name}>
                <div className="public-team-photo"><BarberPhoto src={member.photoUrl} alt={`Foto de ${member.name}`} initials={member.name.slice(0, 2).toUpperCase()} loading="lazy" className="public-team-photo-image" fallbackClassName="public-team-photo-fallback" /><span className="public-team-recommendations">★ {member.recommendations ? `${member.recommendations} recomendações` : 'Novo no time'}</span></div>
                <div className="public-team-copy"><strong>{member.name}</strong><span>{member.role}</span><small>{member.specialty}</small></div>
              </article>)}
            </div>
          </div>
        </section>

        <section className="public-map-section" aria-labelledby="map-title">
          <div className="public-container public-map-grid">
            <div className="public-map-copy">
              <span className="public-eyebrow">Visite a unidade</span>
              <h2 id="map-title">A gente te espera no Macuco.</h2>
              <p>{siteConfig.address.street}<br />{siteConfig.address.neighborhood} · {siteConfig.address.city}/{siteConfig.address.state} · {siteConfig.address.postalCode}</p>
              <a className="public-button public-button-dark" href={siteConfig.address.mapsUrl} {...externalLinkProps}>Abrir rota no mapa <ArrowUpRight size={16} /></a>
            </div>
            <div className="public-map-frame"><iframe title="Mapa da localização da NA Barbearia" src={siteConfig.mapEmbedUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" /></div>
          </div>
        </section>
      </main>

      <footer className="public-footer"><div className="public-container public-footer-inner"><a className="public-brand" href="#inicio" aria-label="NA Barbearia, voltar ao início"><BrandSymbol /></a><span>© {new Date().getFullYear()} NA Barbearia · Santos/SP</span><a className="public-social-link" href={siteConfig.instagramUrl} {...externalLinkProps} aria-label="Instagram da NA Barbearia (abre em nova aba)" title="@nabarbeariaa"><Instagram size={21} aria-hidden="true" /></a></div></footer>
    </div>
  )
}
