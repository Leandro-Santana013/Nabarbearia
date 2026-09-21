import { useEffect, useMemo, useRef, useState } from 'react'
import type * as React from 'react'
import {
  ArrowRight,
  Award,
  Calendar,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  DollarSign,
  ExternalLink,
  Instagram,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  Scissors,
  Sparkles,
  Users,
  UserRound,
  X,
  XCircle,
} from 'lucide-react'
import { DEMO_COMMISSION_RATE, DEMO_DATE, cloneDemoState } from './data/demoRepository'
import {
  calculateOwnerRevenue,
  calculateProfessionalMetrics,
  cancelAppointment,
  createAppointment,
  getAvailableSlots,
  rescheduleAppointment,
  updateAppointmentStatus,
} from './domain/booking'
import type { Appointment, AppointmentStatus, DemoState, UserRole } from './types'

const roleLabels: Record<UserRole, string> = {
  client: 'Cliente',
  barber: 'Barbeiro',
  owner: 'Dono / SuperAdmin',
}

const dateOptions = [
  { value: DEMO_DATE, label: 'Terça, 22 set.' },
  { value: '2026-09-23', label: 'Quarta, 23 set.' },
  { value: '2026-09-24', label: 'Quinta, 24 set.' },
  { value: '2026-09-25', label: 'Sexta, 25 set.' },
]

const statusLabels: Record<AppointmentStatus, string> = {
  confirmed: 'Confirmado',
  completed: 'Concluído',
  'no-show': 'Falta',
  cancelled: 'Cancelado',
}

const formatCurrency = (cents: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(cents / 100)

const formatLongDate = (date: string) => new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
}).format(new Date(`${date}T12:00:00`)).replace('.', '')

const getStatusClass = (status: AppointmentStatus) => `status status-${status}`

function App() {
  const [state, setState] = useState<DemoState>(() => cloneDemoState())
  const [activeRole, setActiveRole] = useState<UserRole>('client')
  const [ownerView, setOwnerView] = useState<'all' | 'mine'>('all')
  const [clientName, setClientName] = useState('Cliente visitante (demo)')
  const [serviceId, setServiceId] = useState('service-cut')
  const [barberId, setBarberId] = useState('barber-a')
  const [date, setDate] = useState(DEMO_DATE)
  const [time, setTime] = useState('')
  const [reschedulingId, setReschedulingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'success' | 'info'; message: string } | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const bookingSectionRef = useRef<HTMLElement>(null)

  const selectedService = state.services.find((service) => service.id === serviceId)
  const selectedBarber = state.barbers.find((barber) => barber.id === barberId)
  const appointmentsForAvailability = useMemo(
    () => state.appointments.filter((appointment) => appointment.id !== reschedulingId),
    [reschedulingId, state.appointments],
  )
  const availableSlots = useMemo(
    () => getAvailableSlots(state.appointments.filter((appointment) => appointment.id !== reschedulingId), state.availabilityBlocks, barberId, date),
    [barberId, date, reschedulingId, state.appointments, state.availabilityBlocks],
  )

  useEffect(() => {
    if (time && availableSlots.includes(time)) return
    setTime(availableSlots[0] ?? '')
  }, [availableSlots, time])

  const showNotice = (message: string, tone: 'success' | 'info' = 'success') => {
    setNotice({ message, tone })
    window.setTimeout(() => setNotice(null), 5000)
  }

  const scrollToBooking = () => {
    setActiveRole('client')
    setMobileNavOpen(false)
    window.setTimeout(() => bookingSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  const selectRole = (role: UserRole) => {
    setActiveRole(role)
    setMobileNavOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleBookingSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!clientName.trim() || !time || !selectedService || !selectedBarber) {
      showNotice('Preencha seu nome e escolha um horário disponível.', 'info')
      return
    }

    if (reschedulingId) {
      setState((current) => ({
        ...current,
        appointments: rescheduleAppointment(current.appointments, reschedulingId, date, time),
      }))
      showNotice('Remarcação salva na agenda demonstrativa.')
      setReschedulingId(null)
      return
    }

    const appointment = createAppointment({
      clientName,
      serviceId,
      barberId,
      date,
      time,
      amountCents: 0,
    }, state.appointments.length + 201)
    setState((current) => ({ ...current, appointments: [...current.appointments, appointment] }))
    showNotice('Horário reservado na agenda demonstrativa.')
  }

  const beginReschedule = (appointment: Appointment) => {
    setActiveRole('client')
    setReschedulingId(appointment.id)
    setClientName(appointment.clientName)
    setServiceId(appointment.serviceId)
    setBarberId(appointment.barberId)
    setDate(appointment.date)
    setTime(appointment.time)
    window.setTimeout(() => bookingSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  const handleCancel = (appointmentId: string) => {
    setState((current) => ({ ...current, appointments: cancelAppointment(current.appointments, appointmentId) }))
    showNotice('Agendamento cancelado na agenda demonstrativa.', 'info')
  }

  const handleStatusChange = (appointmentId: string, status: AppointmentStatus) => {
    setState((current) => ({ ...current, appointments: updateAppointmentStatus(current.appointments, appointmentId, status) }))
    showNotice(`Status atualizado para ${statusLabels[status].toLowerCase()}.`)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Na Barbearia, início">
          <span className="brand-mark" aria-hidden="true"><Scissors size={19} strokeWidth={2.2} /></span>
          <span>na <strong>barbearia</strong></span>
        </a>

        <div className="topbar-center">
          <span className="demo-pill"><span className="pulse-dot" aria-hidden="true" /> Ambiente de demonstração</span>
        </div>

        <div className="topbar-actions">
          <button className="mobile-menu-button icon-button" type="button" aria-label="Abrir menu" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((open) => !open)}>
            {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <nav className={`role-nav ${mobileNavOpen ? 'is-open' : ''}`} aria-label="Visões do produto">
            {(Object.keys(roleLabels) as UserRole[]).map((role) => (
              <button
                className={`role-button ${activeRole === role ? 'is-active' : ''}`}
                type="button"
                key={role}
                aria-pressed={activeRole === role}
                onClick={() => selectRole(role)}
              >
                {role === 'client' && <UserRound size={15} />}
                {role === 'barber' && <Scissors size={15} />}
                {role === 'owner' && <LayoutDashboard size={15} />}
                {roleLabels[role]}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {notice && <div className={`toast toast-${notice.tone}`} role="status"><CheckCircle2 size={17} />{notice.message}<button type="button" aria-label="Fechar aviso" onClick={() => setNotice(null)}><X size={15} /></button></div>}

      <main id="top">
        {activeRole === 'client' && (
          <ClientView
            state={state}
            bookingSectionRef={bookingSectionRef}
            clientName={clientName}
            setClientName={setClientName}
            serviceId={serviceId}
            setServiceId={setServiceId}
            barberId={barberId}
            setBarberId={setBarberId}
            date={date}
            setDate={setDate}
            time={time}
            setTime={setTime}
            availableSlots={availableSlots}
            selectedServiceName={selectedService?.name ?? ''}
            selectedBarberName={selectedBarber?.name ?? ''}
            reschedulingId={reschedulingId}
            onBookingSubmit={handleBookingSubmit}
            onBeginReschedule={beginReschedule}
            onCancel={handleCancel}
            onCancelReschedule={() => setReschedulingId(null)}
            onScrollToBooking={scrollToBooking}
          />
        )}
        {activeRole === 'barber' && <BarberView state={state} onStatusChange={handleStatusChange} />}
        {activeRole === 'owner' && <OwnerView state={state} ownerView={ownerView} setOwnerView={setOwnerView} onStatusChange={handleStatusChange} />}
      </main>

      <button className="sticky-cta" type="button" onClick={scrollToBooking}>
        <CalendarPlus size={18} />
        <span>Agendar horário</span>
        <ArrowRight size={16} />
      </button>

      <footer className="footer">
        <div className="footer-brand"><span className="brand-mark small" aria-hidden="true"><Scissors size={15} /></span><span>na <strong>barbearia</strong></span></div>
        <p>Produto demonstrativo · identidade e dados reais serão configurados pelo estabelecimento.</p>
        <a href="https://www.instagram.com/" target="_blank" rel="noreferrer" className="instagram-link">
          <Instagram size={16} /> Instagram oficial · link a confirmar <ExternalLink size={13} />
        </a>
      </footer>
    </div>
  )
}

interface ClientViewProps {
  state: DemoState
  bookingSectionRef: React.RefObject<HTMLElement | null>
  clientName: string
  setClientName: (value: string) => void
  serviceId: string
  setServiceId: (value: string) => void
  barberId: string
  setBarberId: (value: string) => void
  date: string
  setDate: (value: string) => void
  time: string
  setTime: (value: string) => void
  availableSlots: string[]
  selectedServiceName: string
  selectedBarberName: string
  reschedulingId: string | null
  onBookingSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onBeginReschedule: (appointment: Appointment) => void
  onCancel: (appointmentId: string) => void
  onCancelReschedule: () => void
  onScrollToBooking: () => void
}

function ClientView({
  state,
  bookingSectionRef,
  clientName,
  setClientName,
  serviceId,
  setServiceId,
  barberId,
  setBarberId,
  date,
  setDate,
  time,
  setTime,
  availableSlots,
  selectedServiceName,
  selectedBarberName,
  reschedulingId,
  onBookingSubmit,
  onBeginReschedule,
  onCancel,
  onCancelReschedule,
  onScrollToBooking,
}: ClientViewProps) {
  return (
    <>
      <section className="hero section-wrap" aria-labelledby="hero-title">
        <div className="hero-copy">
          <span className="eyebrow"><Sparkles size={14} /> Agenda digital · MVP</span>
          <h1 id="hero-title">Seu próximo corte começa com um horário marcado.</h1>
          <p className="hero-lede">Uma experiência simples para escolher o serviço, encontrar um profissional e manter sua agenda em dia.</p>
          <div className="hero-actions">
            <button className="primary-button" type="button" onClick={onScrollToBooking}>Agendar horário <ArrowRight size={17} /></button>
            <a className="text-link" href="#services">Ver serviços <ChevronDown size={16} /></a>
          </div>
          <div className="hero-proof"><Check size={15} /> Dados e valores desta tela são demonstrativos</div>
        </div>
        <div className="hero-media-placeholder" aria-label="Área reservada para mídia oficial da barbearia">
          <div className="hero-media-icon"><Scissors size={25} /></div>
          <span className="eyebrow">Mídia oficial</span>
          <strong>Espaço reservado para uma foto real</strong>
          <small>Imagem e identidade visual serão inseridas após validação do estabelecimento.</small>
        </div>
      </section>

      <section className="trust-strip" aria-label="Princípios do produto">
        <div><CalendarCheck size={18} /><span><strong>Agenda clara</strong><small>Escolha sem atrito</small></span></div>
        <div><Clock3 size={18} /><span><strong>Mais previsibilidade</strong><small>Confirmações em um só lugar</small></span></div>
        <div><Users size={18} /><span><strong>Equipe alinhada</strong><small>Visões por perfil</small></span></div>
      </section>

      <section className="section-wrap booking-section" ref={bookingSectionRef} id="booking" aria-labelledby="booking-title">
        <SectionHeading eyebrow="01 · reservar" title={reschedulingId ? 'Escolha o novo horário' : 'Monte seu próximo horário'} description="Os campos abaixo usam o catálogo e a disponibilidade da demonstração. No produto real, essas regras virão do estabelecimento." />
        <div className="booking-layout">
          <form className="booking-card card" onSubmit={onBookingSubmit}>
            <div className="form-step"><span>1</span><div><strong>Como podemos chamar você?</strong><small>Nome exibido no agendamento</small></div></div>
            <label className="field-label" htmlFor="client-name">Seu nome</label>
            <input id="client-name" className="text-input" value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Digite seu nome" autoComplete="name" />

            <div className="form-step"><span>2</span><div><strong>Escolha um serviço</strong><small>Catálogo demonstrativo</small></div></div>
            <div className="choice-grid service-choice-grid">
              {state.services.map((service) => (
                <button className={`choice-card ${serviceId === service.id ? 'is-selected' : ''}`} type="button" key={service.id} onClick={() => setServiceId(service.id)} aria-pressed={serviceId === service.id}>
                  <span className="choice-icon"><Scissors size={17} /></span>
                  <span><strong>{service.name}</strong><small>{service.description}</small></span>
                  {serviceId === service.id && <CheckCircle2 className="choice-check" size={17} />}
                </button>
              ))}
            </div>
            <p className="micro-note"><CircleAlert size={14} /> Preço e duração ainda não foram informados. Exibimos apenas o fluxo.</p>

            <div className="form-step"><span>3</span><div><strong>Encontre seu profissional</strong><small>Escala demonstrativa</small></div></div>
            <div className="barber-choice-list">
              {state.barbers.map((barber) => (
                <button className={`barber-choice ${barberId === barber.id ? 'is-selected' : ''}`} type="button" key={barber.id} onClick={() => setBarberId(barber.id)} aria-pressed={barberId === barber.id}>
                  <span className="avatar">{barber.initials}</span>
                  <span><strong>{barber.name}</strong><small>{barber.specialty}</small></span>
                  <span className="barber-availability">{barber.availabilityLabel}</span>
                  {barberId === barber.id && <CheckCircle2 className="choice-check" size={17} />}
                </button>
              ))}
            </div>

            <div className="form-step"><span>4</span><div><strong>Quando fica melhor?</strong><small>Slots da agenda demonstrativa</small></div></div>
            <div className="date-time-grid">
              <label className="field-label">Data
                <select className="text-input select-input" value={date} onChange={(event) => setDate(event.target.value)}>
                  {dateOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="field-label">Horário
                <select className="text-input select-input" value={time} onChange={(event) => setTime(event.target.value)} disabled={!availableSlots.length}>
                  {availableSlots.length ? availableSlots.map((slot) => <option value={slot} key={slot}>{slot}</option>) : <option value="">Sem horários livres</option>}
                </select>
              </label>
            </div>
            <div className="booking-summary"><Calendar size={16} /><span>{formatLongDate(date)} · {time || 'selecione um horário'}</span><span className="summary-divider" /> <Scissors size={16} /><span>{selectedServiceName} com {selectedBarberName}</span></div>
            <button className="primary-button full-width" type="submit" disabled={!availableSlots.length}>
              {reschedulingId ? <CalendarClock size={17} /> : <CalendarPlus size={17} />}
              {reschedulingId ? 'Confirmar remarcação' : 'Reservar horário'}
            </button>
            {reschedulingId && <button className="quiet-button full-width" type="button" onClick={onCancelReschedule}>Sair da remarcação</button>}
          </form>

          <aside className="booking-side">
            <div className="aside-card dark-card">
              <span className="eyebrow">Seu resumo</span>
              <div className="summary-big"><span>{dateOptions.find((option) => option.value === date)?.label ?? date}</span><strong>{time || '—'}</strong></div>
              <div className="aside-line"><span>Serviço</span><strong>{selectedServiceName}</strong></div>
              <div className="aside-line"><span>Profissional</span><strong>{selectedBarberName}</strong></div>
              <div className="aside-foot"><CircleAlert size={15} /> Valores, duração e políticas serão configurados pela equipe.</div>
            </div>
            <div className="aside-card light-card"><div className="mini-icon"><CalendarDays size={18} /></div><strong>Precisa mudar os planos?</strong><p>Use a opção de remarcar ou cancelar na sua agenda demonstrativa. Em produção, o histórico ficará registrado.</p></div>
          </aside>
        </div>
      </section>

      <section className="section-wrap services-section" id="services" aria-labelledby="services-title">
        <SectionHeading eyebrow="02 · catálogo" title="Serviços que cabem na sua rotina" description="Uma vitrine inicial pronta para receber o catálogo validado da casa — sem preço ou duração inventados." />
        <div className="service-catalog-grid">
          {state.services.map((service, index) => (
            <article className="catalog-card" key={service.id}>
              <div className="catalog-number">0{index + 1}</div>
              <div className="catalog-icon"><Scissors size={18} /></div>
              <h3>{service.name}</h3>
              <p>{service.description}</p>
              <span className="config-label">Detalhes a configurar</span>
            </article>
          ))}
        </div>
      </section>

      <section className="section-wrap appointments-section" aria-labelledby="appointments-title">
        <div className="section-heading inline-heading"><div><span className="eyebrow">03 · sua agenda</span><h2 id="appointments-title">Agendamentos da demonstração</h2></div><span className="outline-label">Estado local · sem login</span></div>
        <div className="appointments-list">
          {state.appointments.filter((appointment) => appointment.status !== 'cancelled').map((appointment) => <ClientAppointmentCard key={appointment.id} appointment={appointment} state={state} onBeginReschedule={onBeginReschedule} onCancel={onCancel} />)}
          {!state.appointments.some((appointment) => appointment.status !== 'cancelled') && <EmptyState title="Nenhum horário ativo" description="Reserve um novo horário para vê-lo aqui." />}
        </div>
      </section>

      <section className="section-wrap contact-section" aria-labelledby="contact-title">
        <div className="contact-copy"><span className="eyebrow">04 · próximos passos</span><h2 id="contact-title">Um espaço pronto para ganhar a cara da sua barbearia.</h2><p>Endereço, horários oficiais, fotos e canais de contato entram aqui depois da validação. O MVP já deixa o caminho preparado.</p></div>
        <div className="contact-placeholder"><div className="contact-placeholder-item"><span>Endereço</span><strong>A confirmar pelo estabelecimento</strong></div><div className="contact-placeholder-item"><span>Horários</span><strong>A configurar pela equipe</strong></div><div className="contact-placeholder-item"><span>Instagram</span><strong>Link oficial a confirmar</strong></div></div>
      </section>
    </>
  )
}

function ClientAppointmentCard({ appointment, state, onBeginReschedule, onCancel }: { appointment: Appointment; state: DemoState; onBeginReschedule: (appointment: Appointment) => void; onCancel: (appointmentId: string) => void }) {
  const service = state.services.find((item) => item.id === appointment.serviceId)
  const barber = state.barbers.find((item) => item.id === appointment.barberId)
  return <article className="appointment-card"><div className="appointment-date"><strong>{new Date(`${appointment.date}T12:00:00`).getDate()}</strong><span>{new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(`${appointment.date}T12:00:00`)).replace('.', '')}</span></div><div className="appointment-main"><div className="appointment-topline"><span className={getStatusClass(appointment.status)}>{statusLabels[appointment.status]}</span><span className="demo-tag">DEMO</span></div><h3>{service?.name}</h3><p>{formatLongDate(appointment.date)} · {appointment.time} · {barber?.name}</p></div><div className="appointment-actions">{appointment.status === 'confirmed' && <><button className="small-button" type="button" onClick={() => onBeginReschedule(appointment)}>Remarcar</button><button className="small-button danger" type="button" onClick={() => onCancel(appointment.id)}>Cancelar</button></>}</div></article>
}

function BarberView({ state, onStatusChange }: { state: DemoState; onStatusChange: (appointmentId: string, status: AppointmentStatus) => void }) {
  const barber = state.barbers[0]
  const ownAppointments = state.appointments.filter((appointment) => appointment.barberId === barber.id)
  const metrics = calculateProfessionalMetrics(state.appointments, barber.id, DEMO_COMMISSION_RATE)
  return <DashboardShell eyebrow="Visão barbeiro" title={`Olá, ${barber.name.replace(' (demo)', '')}.`} description="Acompanhe sua agenda, atualize o atendimento e veja o reflexo nos indicadores demonstrativos."><div className="dashboard-callout"><div className="callout-icon"><Scissors size={18} /></div><div><strong>Perfil profissional · modo demonstração</strong><p>Esta troca de perfil é apenas uma simulação local. Permissões reais deverão ser validadas no servidor.</p></div><span className="demo-tag">SEM LOGIN</span></div><MetricsGrid metrics={[{ label: 'Na agenda', value: String(metrics.total), detail: `${metrics.confirmed} confirmados`, icon: CalendarCheck }, { label: 'Concluídos', value: String(metrics.completed), detail: 'Só concluídos entram no financeiro', icon: CheckCircle2 }, { label: 'Receita (demo)', value: formatCurrency(metrics.revenueCents), detail: 'Valores configuráveis', icon: DollarSign }, { label: 'Comissão (demo)', value: formatCurrency(metrics.commissionCents), detail: `${Math.round(DEMO_COMMISSION_RATE * 100)}% ilustrativo`, icon: Award }]} /><section className="dashboard-panel"><div className="panel-heading"><div><span className="eyebrow">Agenda pessoal</span><h2>Próximos atendimentos</h2></div><span className="outline-label">{ownAppointments.length} registros</span></div><div className="professional-agenda">{ownAppointments.sort(sortAppointments).map((appointment) => <ProfessionalAppointmentRow key={appointment.id} appointment={appointment} state={state} onStatusChange={onStatusChange} />)}</div></section></DashboardShell>
}

function OwnerView({ state, ownerView, setOwnerView, onStatusChange }: { state: DemoState; ownerView: 'all' | 'mine'; setOwnerView: (view: 'all' | 'mine') => void; onStatusChange: (appointmentId: string, status: AppointmentStatus) => void }) {
  const ownerBarber = state.barbers[0]
  const visibleAppointments = ownerView === 'mine' ? state.appointments.filter((appointment) => appointment.barberId === ownerBarber.id) : state.appointments
  const completed = visibleAppointments.filter((appointment) => appointment.status === 'completed')
  const confirmed = visibleAppointments.filter((appointment) => appointment.status === 'confirmed')
  const revenue = calculateOwnerRevenue(visibleAppointments)
  return <DashboardShell eyebrow="Visão dono / SuperAdmin" title="A operação em uma só leitura." description="Uma central enxuta para acompanhar agenda, equipe e os indicadores que dependem de atendimentos concluídos."><div className="owner-toolbar"><div><span className="eyebrow">Escopo da agenda</span><strong>{ownerView === 'all' ? 'Toda a equipe' : 'Minha agenda · perfil híbrido'}</strong></div><div className="segmented-control" role="group" aria-label="Escopo da agenda do dono"><button className={ownerView === 'all' ? 'is-active' : ''} type="button" onClick={() => setOwnerView('all')} aria-pressed={ownerView === 'all'}><Users size={15} /> Geral</button><button className={ownerView === 'mine' ? 'is-active' : ''} type="button" onClick={() => setOwnerView('mine')} aria-pressed={ownerView === 'mine'}><UserRound size={15} /> Minha agenda</button></div></div><MetricsGrid metrics={[{ label: 'Agendamentos', value: String(visibleAppointments.filter((appointment) => appointment.status !== 'cancelled').length), detail: `${confirmed.length} confirmados`, icon: CalendarDays }, { label: 'Concluídos', value: String(completed.length), detail: 'Base financeira', icon: CheckCircle2 }, { label: 'Receita (demo)', value: formatCurrency(revenue), detail: 'Somente concluídos', icon: DollarSign }, { label: 'Equipe ativa', value: String(state.barbers.length), detail: 'Escala demonstrativa', icon: Users }]} /><div className="owner-grid"><section className="dashboard-panel"><div className="panel-heading"><div><span className="eyebrow">Agenda geral</span><h2>{ownerView === 'all' ? 'Todos os atendimentos' : 'Atendimentos da minha agenda'}</h2></div><span className="outline-label">{visibleAppointments.length} registros</span></div><div className="professional-agenda">{visibleAppointments.sort(sortAppointments).map((appointment) => <ProfessionalAppointmentRow key={appointment.id} appointment={appointment} state={state} onStatusChange={onStatusChange} />)}</div></section><section className="dashboard-panel team-panel"><div className="panel-heading"><div><span className="eyebrow">Equipe e escala</span><h2>Visão rápida</h2></div><MoreHorizontal size={19} /></div><div className="team-list">{state.barbers.map((barber) => { const count = state.appointments.filter((appointment) => appointment.barberId === barber.id && appointment.status !== 'cancelled').length; return <div className="team-row" key={barber.id}><span className="avatar">{barber.initials}</span><span><strong>{barber.name}</strong><small>{barber.specialty}</small></span><span className="team-count">{count}<small>na agenda</small></span></div> })}</div><div className="team-note"><CircleAlert size={15} /><span>Escalas, folgas e bloqueios ficam prontos para um módulo de disponibilidade.</span></div></section></div><section className="financial-strip"><div className="financial-title"><DollarSign size={19} /><div><span className="eyebrow">Financeiro preparado</span><strong>Somente atendimentos concluídos geram entrada</strong></div></div><span>Sem integração de pagamento · valores demo</span></section></DashboardShell>
}

function ProfessionalAppointmentRow({ appointment, state, onStatusChange }: { appointment: Appointment; state: DemoState; onStatusChange: (appointmentId: string, status: AppointmentStatus) => void }) {
  const client = appointment.clientName
  const service = state.services.find((item) => item.id === appointment.serviceId)?.name ?? 'Serviço demonstrativo'
  return <article className="professional-row"><div className="professional-time"><strong>{appointment.time}</strong><span>{formatLongDate(appointment.date)}</span></div><div className="professional-client"><span className="avatar small-avatar"><UserRound size={15} /></span><span><strong>{client}</strong><small>{service} · {formatCurrency(appointment.amountCents)} demo</small></span></div><span className={getStatusClass(appointment.status)}>{statusLabels[appointment.status]}</span><div className="status-actions" aria-label={`Alterar status de ${client}`}><button className={appointment.status === 'confirmed' ? 'selected' : ''} type="button" onClick={() => onStatusChange(appointment.id, 'confirmed')}>Confirmar</button><button className={appointment.status === 'completed' ? 'selected' : ''} type="button" onClick={() => onStatusChange(appointment.id, 'completed')}>Concluir</button><button className={appointment.status === 'no-show' ? 'selected danger-text' : ''} type="button" onClick={() => onStatusChange(appointment.id, 'no-show')}>Falta</button></div></article>
}

function DashboardShell({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return <div className="dashboard-page section-wrap"><div className="dashboard-hero"><div><span className="eyebrow"><LayoutDashboard size={14} /> {eyebrow}</span><h1>{title}</h1><p>{description}</p></div><div className="dashboard-hero-mark"><Scissors size={31} /><span>NA<br />BARB.</span></div></div>{children}</div>
}

function MetricsGrid({ metrics }: { metrics: Array<{ label: string; value: string; detail: string; icon: typeof Calendar }> }) {
  return <div className="metrics-grid">{metrics.map(({ label, value, detail, icon: Icon }) => <article className="metric-card" key={label}><div className="metric-icon"><Icon size={18} /></div><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}</div>
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="section-heading"><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{description}</p></div>
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="empty-state"><CalendarClock size={22} /><strong>{title}</strong><span>{description}</span></div>
}

const sortAppointments = (a: Appointment, b: Appointment) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)

export default App
