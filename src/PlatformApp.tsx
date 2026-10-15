import CommissionRuleForm from './components/CommissionRuleForm'
import { useEffect, useMemo, useState } from 'react'
import type * as React from 'react'
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  DollarSign,
  LogOut,
  Plus,
  RefreshCw,
  Scissors,
  ShieldCheck,
  Star,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { ApiError, api, type AuthResponse, type AvailabilitySlot, type RevenueReport, type UserSession } from './services/api'
import type { Appointment, AppointmentStatus, Barber, Service, UserRole } from './types'
import { BarberPhoto } from './components/BarberPhoto'
import LoginScreen from './pages/LoginScreen'
import BarberDashboard from './pages/BarberDashboard'

const roleLabels: Record<UserRole, string> = {
  client: 'Cliente',
  barber: 'Barbeiro',
  owner: 'Proprietário',
}

const statusLabels: Record<AppointmentStatus, string> = {
  confirmed: 'Confirmado',
  completed: 'Concluído',
  'no-show': 'Não compareceu',
  cancelled: 'Cancelado',
}

const formatCurrency = (cents: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(cents / 100)

const formatDateTime = (iso?: string) => iso
  ? new Intl.DateTimeFormat('pt-BR', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso)).replace('.', '')
  : 'Data não informada'

const localDate = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const toUtcIso = (date: string, time: string) => new Date(`${date}T${time}:00`).toISOString()

const nextDates = (count: number) => Array.from({ length: count }, (_, index) => {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + index)
  return {
    value: localDate(date),
    label: new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
      .format(date)
      .replace('.', ''),
  }
})

const getErrorMessage = (error: unknown) => error instanceof ApiError
  ? error.message
  : 'Não foi possível concluir a operação. Tente novamente.'

export default function PlatformApp() {
  const [session, setSession] = useState<AuthResponse | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [connectionError, setConnectionError] = useState('')

  useEffect(() => {
    api.authSession()
      .then(setSession)
      .catch((error) => setConnectionError(getErrorMessage(error)))
      .finally(() => setCheckingSession(false))
  }, [])

  if (checkingSession) {
    return <LoadingScreen label="Verificando sua sessão" />
  }

  if (!session) {
    return <LoginScreen initialError={connectionError} onAuthenticated={setSession} />
  }

  if (session.user.roles.includes('barber') && !session.user.roles.includes('owner')) {
    return <BarberDashboard session={session} />
  }

  if (session.user.roles.includes('client') && !session.user.roles.includes('owner')) {
    return <ClientHomeRedirect />
  }

  if (session.user.roles.includes('owner')) return <OwnerManagementRedirect />
  return <Workspace session={session} onLogout={() => setSession(null)} />
}

function OwnerManagementRedirect() {
  useEffect(() => {
    window.history.replaceState({}, '', '/gestao/financeiro')
    window.dispatchEvent(new Event('popstate'))
  }, [])
  return <LoadingScreen label="Abrindo painel de gestão" />
}

function ClientHomeRedirect() {
  useEffect(() => {
    window.history.replaceState({}, '', '/home')
    window.dispatchEvent(new Event('popstate'))
  }, [])
  return <LoadingScreen label="Abrindo sua barbearia" />
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="platform-loading">
      <Scissors size={30} />
      <p>{label}...</p>
    </div>
  )
}

function Workspace({ session, onLogout }: { session: AuthResponse; onLogout: () => void }) {
  const role = session.user.roles.includes('owner') ? 'owner' : session.user.roles.includes('barber') ? 'barber' : 'client'
  const [services, setServices] = useState<Service[]>([])
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [report, setReport] = useState<RevenueReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const showNotice = (message: string, tone: 'success' | 'error' = 'success') => {
    setNotice({ message, tone })
    window.setTimeout(() => setNotice(null), 5000)
  }

  const load = async () => {
    setRefreshing(true)
    try {
      const [serviceList, barberList, appointmentList] = await Promise.all([
        api.getPublicServices(),
        api.getPublicBarbers(),
        api.listAppointments(),
      ])
      setServices(serviceList)
      setBarbers(barberList)
      setAppointments(appointmentList)
      if (role !== 'client') setReport(await api.getRevenueReport())
      else setReport(null)
    } catch (error) {
      showNotice(getErrorMessage(error), 'error')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { void load() }, [role])

  const handleLogout = async () => {
    try {
      await api.logout()
    } finally {
      onLogout()
    }
  }

  const handleAction = async (action: () => Promise<void>, success: string) => {
    try {
      await action()
      showNotice(success)
      await load()
    } catch (error) {
      showNotice(getErrorMessage(error), 'error')
    }
  }

  return (
    <div className="platform-shell">
      <header className="platform-header">
        <a className="brand" href="/" aria-label="NA Barbearia, início">
          <span className="brand-mark"><Scissors size={18} /></span>
          <span>NA <strong>Barbearia</strong></span>
        </a>
        <div className="session-summary">
          <span className="session-avatar">{session.user.display_name.slice(0, 1).toUpperCase()}</span>
          <span><strong>{session.user.display_name}</strong><small>{roleLabels[role]}</small></span>
        </div>
        <div className="header-actions">
          <button className="icon-button" type="button" onClick={() => void load()} aria-label="Atualizar dados" disabled={refreshing}>
            <RefreshCw size={17} className={refreshing ? 'spin' : ''} />
          </button>
          <button className="quiet-button" type="button" onClick={() => void handleLogout()}><LogOut size={16} /> Sair</button>
        </div>
      </header>

      {notice && <div className={`toast toast-${notice.tone}`} role="status"><CheckCircle2 size={17} /> {notice.message}<button type="button" aria-label="Fechar aviso" onClick={() => setNotice(null)}><X size={15} /></button></div>}

      <main className="platform-main">
        <div className="platform-heading">
          <div>
            <span className="section-eyebrow">{role === 'owner' ? 'Visão do negócio' : role === 'barber' ? 'Sua operação' : 'Sua jornada'}</span>
            <h1>{role === 'owner' ? 'Operação da NA Barbearia' : role === 'barber' ? 'Agenda e financeiro' : 'Agende seu próximo horário'}</h1>
            <p className="muted">Dados sincronizados com a plataforma operacional.</p>
          </div>
          <div className="connection-status"><span /> API conectada</div>
        </div>

        {loading ? <LoadingScreen label="Carregando dados" /> : (
          <>
            {role === 'client' && <ClientWorkspace services={services} barbers={barbers} appointments={appointments} onRefresh={load} onAction={handleAction} />}
            {role === 'barber' && <ProfessionalWorkspace appointments={appointments} report={report} onAction={handleAction} />}
            {role === 'owner' && <OwnerWorkspace services={services} barbers={barbers} appointments={appointments} report={report} onRefresh={load} onAction={handleAction} onNotice={showNotice} />}
          </>
        )}
      </main>
    </div>
  )
}

function ClientWorkspace({ services, barbers, appointments, onRefresh, onAction }: {
  services: Service[]
  barbers: Barber[]
  appointments: Appointment[]
  onRefresh: () => Promise<void>
  onAction: (action: () => Promise<void>, success: string) => Promise<void>
}) {
  const dates = useMemo(() => nextDates(14), [])
  const [serviceId, setServiceId] = useState('')
  const [barberId, setBarberId] = useState('')
  const [date, setDate] = useState(dates[0].value)
  const [slots, setSlots] = useState<AvailabilitySlot[]>([])
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!serviceId && services[0]) setServiceId(services[0].id)
  }, [serviceId, services])

  useEffect(() => {
    if (!serviceId || !date) return
    setLoadingSlots(true)
    setSelectedSlot(null)
    api.getAvailability(serviceId, date, barberId || undefined)
      .then(setSlots)
      .catch((availabilityError) => { setSlots([]); setError(getErrorMessage(availabilityError)) })
      .finally(() => setLoadingSlots(false))
  }, [serviceId, date, barberId])

  const submitBooking = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedSlot) {
      setError('Escolha um horário disponível para continuar.')
      return
    }
    setError('')
    await onAction(
      () => api.createAppointment({ barber_user_id: selectedSlot.barber_id, service_id: serviceId, starts_at: selectedSlot.starts_at }),
      'Agendamento confirmado com sucesso.',
    )
    setSelectedSlot(null)
    await onRefresh()
  }

  return (
    <div className="workspace-grid client-grid">
      <section className="panel-card booking-panel" aria-labelledby="booking-title-visible">
        <div className="card-heading booking-heading-intro"><div><span className="section-eyebrow">Novo agendamento</span><h2 id="booking-title-visible">Escolha serviço, profissional e horário</h2></div><CalendarDays size={22} /></div>
        {!!services.length && <BookingOptionPanels services={services} barbers={barbers} serviceId={serviceId} barberId={barberId} onServiceChange={setServiceId} onBarberChange={setBarberId} />}
        <div className="card-heading"><div><span className="section-eyebrow">Novo agendamento</span><h2 id="booking-title">Escolha serviço, profissional e horário</h2></div><CalendarDays size={22} /></div>
        {error && <div className="notice notice-error" role="alert"><X size={18} /> {error}</div>}
        {!services.length ? <EmptyState title="Catálogo ainda não configurado" text="O proprietário precisa cadastrar os serviços antes de abrir a agenda." /> : (
          <form className="stack-form" onSubmit={submitBooking}>
            <label>Serviço<select value={serviceId} onChange={(event) => setServiceId(event.target.value)}>{services.map((service) => <option value={service.id} key={service.id}>{service.name} · {formatCurrency(service.priceCents)} · {service.durationMinutes} min</option>)}</select></label>
            <label>Profissional<select value={barberId} onChange={(event) => setBarberId(event.target.value)}><option value="">Qualquer profissional</option>{barbers.map((barber) => <option value={barber.id} key={barber.id}>{barber.name}</option>)}</select></label>
            <div><span className="field-caption">Data</span><div className="date-strip">{dates.slice(0, 7).map((option) => <button className={date === option.value ? 'date-option is-selected' : 'date-option'} type="button" key={option.value} onClick={() => setDate(option.value)}>{option.label}</button>)}</div></div>
            <div><span className="field-caption">Horários disponíveis</span>{loadingSlots ? <div className="inline-loading"><RefreshCw size={15} className="spin" /> Consultando agenda...</div> : slots.length ? <div className="slot-grid">{slots.map((slot) => <button className={selectedSlot?.starts_at === slot.starts_at && selectedSlot.barber_id === slot.barber_id ? 'slot-button is-selected' : 'slot-button'} type="button" key={`${slot.barber_id}-${slot.starts_at}`} onClick={() => setSelectedSlot(slot)}>{new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(slot.starts_at))}</button>)}</div> : <p className="empty-inline">Nenhum horário disponível nesta data.</p>}</div>
            <button className="primary-button" type="submit" disabled={!selectedSlot || loadingSlots}>Confirmar agendamento <ArrowRight size={17} /></button>
          </form>
        )}
      </section>
      <section className="panel-card" aria-labelledby="client-history-title"><div className="card-heading"><div><span className="section-eyebrow">Histórico</span><h2 id="client-history-title">Seus agendamentos</h2></div><Clock3 size={22} /></div><AppointmentList appointments={appointments} onAction={onAction} emptyTitle="Você ainda não tem agendamentos." /></section>
    </div>
  )
}

function BookingOptionPanels({ services, barbers, serviceId, barberId, onServiceChange, onBarberChange }: {
  services: Service[]
  barbers: Barber[]
  serviceId: string
  barberId: string
  onServiceChange: (id: string) => void
  onBarberChange: (id: string) => void
}) {
  const [barberSlide, setBarberSlide] = useState(0)
  const barbersPerSlide = 3
  const serviceGroups = useMemo(() => services.reduce<Record<string, Service[]>>((groups, service) => {
    const category = service.category || 'Serviços'
    groups[category] = [...(groups[category] ?? []), service]
    return groups
  }, {}), [services])
  const barberOptions = useMemo(() => [{
    id: '',
    name: 'Qualquer profissional',
    initials: 'NA',
    specialty: 'Primeiro horário disponível',
    recommendations: undefined,
  }, ...barbers], [barbers])
  const selectedBarberSlide = Math.max(0, barberOptions.findIndex((barber) => barber.id === barberId))
  const maxBarberSlide = Math.max(0, barberOptions.length - barbersPerSlide)
  const visibleBarbers = barberOptions.slice(barberSlide, barberSlide + barbersPerSlide)
  const visibleBarber = visibleBarbers[0] ?? barberOptions[0]

  useEffect(() => {
    const selectedPage = Math.floor(selectedBarberSlide / barbersPerSlide) * barbersPerSlide
    setBarberSlide(Math.min(maxBarberSlide, selectedPage))
  }, [maxBarberSlide, selectedBarberSlide])

  const moveBarber = (direction: -1 | 1) => {
    setBarberSlide((current) => Math.min(maxBarberSlide, Math.max(0, current + direction * barbersPerSlide)))
  }

  return <div className="booking-option-panels">
    <div>
      <span className="field-caption">Escolha o serviço</span>
      <div className="service-picker">{Object.entries(serviceGroups).map(([category, categoryServices]) => <div className="service-group" key={category}>
        <span className="picker-group-label">{category}</span>
        <div className="service-card-grid">{categoryServices.map((service) => <button className={serviceId === service.id ? 'service-card is-selected' : 'service-card'} type="button" key={service.id} onClick={() => onServiceChange(service.id)} aria-pressed={serviceId === service.id}>
          <span className="service-card-top"><strong>{service.name}</strong><span>{formatCurrency(service.priceCents)}</span></span>
          <small>{service.description || 'Atendimento personalizado na NA Barbearia.'}</small>
          <span className="service-card-meta"><Clock3 size={13} /> {service.durationMinutes} min</span>
        </button>)}</div>
      </div>)}</div>
    </div>
    <div>
      <span className="field-caption">Escolha seu profissional</span>
      <div className="barber-slider barber-card-slider" aria-label="Tres profissionais por vez">
        <button className="barber-slide-arrow" type="button" onClick={() => moveBarber(-1)} aria-label="Ver barbeiros anteriores" disabled={barberSlide === 0}><ChevronLeft size={19} /></button>
        <div className="barber-card-viewport">
          {visibleBarbers.map((barber) => <button className={barberId === barber.id ? 'barber-option is-selected' : 'barber-option'} type="button" key={barber.id} onClick={() => onBarberChange(barber.id)} aria-pressed={barberId === barber.id}>
            <BarberPhoto src={barber.photoUrl} alt={`Foto de ${barber.name}`} initials={barber.initials} className="barber-option-avatar" fallbackClassName="barber-option-avatar" />
            <span className="barber-option-info"><strong>{barber.name}</strong><small>{barber.specialty ?? 'Barbeiro(a)'}</small>{barber.id ? <span className="barber-option-rating"><Star size={14} fill="currentColor" /> {barber.recommendations ? `${barber.recommendations} recomendacoes` : 'Sem recomendacoes ainda'}</span> : <span className="barber-option-rating">Escolha automatica</span>}</span>
            {barberId === barber.id && <CheckCircle2 className="barber-option-check" size={20} />}
          </button>)}
        </div>
        <button className="barber-slide-arrow" type="button" onClick={() => moveBarber(1)} aria-label="Ver proximos barbeiros" disabled={barberSlide >= maxBarberSlide}><ChevronRight size={19} /></button>
      </div>
      <div className="barber-slide-status barber-card-status" aria-live="polite">{barberSlide + 1}-{Math.min(barberSlide + barbersPerSlide, barberOptions.length)} de {barberOptions.length} profissionais</div>
      <div className="barber-slider" aria-label="Profissionais disponíveis">
        <button className="barber-slide-arrow" type="button" onClick={() => moveBarber(-1)} aria-label="Ver barbeiro anterior" disabled={barberOptions.length < 2}><ChevronLeft size={19} /></button>
        <button className={barberId === visibleBarber.id ? 'barber-option is-selected' : 'barber-option'} type="button" onClick={() => onBarberChange(visibleBarber.id)} aria-pressed={barberId === visibleBarber.id}>
          <BarberPhoto src={visibleBarber.photoUrl} alt={`Foto de ${visibleBarber.name}`} initials={visibleBarber.initials} className="barber-option-avatar" fallbackClassName="barber-option-avatar" />
          <span className="barber-option-info"><strong>{visibleBarber.name}</strong><small>{visibleBarber.specialty ?? 'Barbeiro(a)'}</small>{visibleBarber.id ? <span className="barber-option-rating"><Star size={14} fill="currentColor" /> {visibleBarber.recommendations ? `${visibleBarber.recommendations} recomendações` : 'Sem recomendações ainda'}</span> : <span className="barber-option-rating">Escolha automática</span>}</span>
          {barberId === visibleBarber.id && <CheckCircle2 className="barber-option-check" size={20} />}
        </button>
        <button className="barber-slide-arrow" type="button" onClick={() => moveBarber(1)} aria-label="Ver próximo barbeiro" disabled={barberOptions.length < 2}><ChevronRight size={19} /></button>
      </div>
      <div className="barber-slide-status" aria-live="polite">{barberSlide + 1} de {barberOptions.length} profissionais</div>
      <div className="barber-picker legacy-barber-picker">
        <button className={barberId === '' ? 'barber-option is-selected' : 'barber-option'} type="button" onClick={() => onBarberChange('')} aria-pressed={barberId === ''}>
          <span className="barber-option-avatar">NA</span><span><strong>Qualquer profissional</strong><small>Primeiro horário disponível</small></span>
        </button>
        {barbers.map((barber) => <button className={barberId === barber.id ? 'barber-option is-selected' : 'barber-option'} type="button" key={barber.id} onClick={() => onBarberChange(barber.id)} aria-pressed={barberId === barber.id}>
          <BarberPhoto src={barber.photoUrl} alt={`Foto de ${barber.name}`} initials={barber.initials} className="barber-option-avatar" fallbackClassName="barber-option-avatar" />
          <span><strong>{barber.name}</strong><small>{barber.specialty ?? 'Barbeiro(a)'}</small></span>
        </button>)}
      </div>
    </div>
  </div>
}

function ProfessionalWorkspace({ appointments, report, onAction }: { appointments: Appointment[]; report: RevenueReport | null; onAction: (action: () => Promise<void>, success: string) => Promise<void> }) {
  return <div className="owner-layout">
    <RevenueMetrics report={report} personal />
    <section className="panel-card" aria-labelledby="financial-dashboard-title"><div className="card-heading"><div><span className="section-eyebrow">Dashboard financeiro</span><h2 id="financial-dashboard-title">Seu resultado e sua agenda</h2></div><DollarSign size={22} /></div><AppointmentList appointments={appointments} onAction={onAction} professional emptyTitle="Nenhum atendimento encontrado." /></section>
  </div>
}

function OwnerWorkspace({ services, barbers, appointments, report, onRefresh, onAction, onNotice }: {
  services: Service[]
  barbers: Barber[]
  appointments: Appointment[]
  report: RevenueReport | null
  onRefresh: () => Promise<void>
  onAction: (action: () => Promise<void>, success: string) => Promise<void>
  onNotice: (message: string, tone?: 'success' | 'error') => void
}) {
  const [showServiceForm, setShowServiceForm] = useState(false)
  const [showBarberForm, setShowBarberForm] = useState(false)
  const [showScheduleForm, setShowScheduleForm] = useState(false)
  const [service, setService] = useState({ name: '', description: '', category: '', price: '', duration: '30' })
  const [barber, setBarber] = useState({ name: '', email: '', password: '', photoUrl: '' })
  const [schedule, setSchedule] = useState({ barberId: '', weekday: '1', start: '09:00', end: '18:00' })

  const saveService = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      await api.createService({ name: service.name, description: service.description, category: service.category || undefined, price_cents: Math.round(Number(service.price.replace(',', '.')) * 100), duration_minutes: Number(service.duration) })
      onNotice('Serviço cadastrado com sucesso.')
      setService({ name: '', description: '', category: '', price: '', duration: '30' }); setShowServiceForm(false); await onRefresh()
    } catch (error) { onNotice(getErrorMessage(error), 'error') }
  }

  const saveBarber = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      await api.createBarber({ display_name: barber.name, email: barber.email, password: barber.password, photo_url: barber.photoUrl || undefined })
      onNotice('Barbeiro cadastrado com sucesso.')
      setBarber({ name: '', email: '', password: '', photoUrl: '' }); setShowBarberForm(false); await onRefresh()
    } catch (error) { onNotice(getErrorMessage(error), 'error') }
  }

  const saveSchedule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const toMinutes = (value: string) => { const [hour, minute] = value.split(':').map(Number); return hour * 60 + minute }
    try {
      await api.createSchedule({ barber_user_id: schedule.barberId, weekday: Number(schedule.weekday), start_minute: toMinutes(schedule.start), end_minute: toMinutes(schedule.end) })
      onNotice('Escala cadastrada. A agenda já pode receber reservas.')
      setShowScheduleForm(false); await onRefresh()
    } catch (error) { onNotice(getErrorMessage(error), 'error') }
  }

  return (
    <div className="owner-layout">
      <RevenueMetrics report={report} />
      <CommissionRuleForm barbers={barbers} services={services} onSaved={onRefresh} />
      <section className="panel-card"><div className="card-heading"><div><span className="section-eyebrow">Configuração</span><h2>Catálogo e equipe</h2></div><ShieldCheck size={22} /></div><div className="management-actions"><button className="secondary-button" type="button" onClick={() => setShowServiceForm(!showServiceForm)}><Plus size={16} /> Novo serviço</button><button className="secondary-button" type="button" onClick={() => setShowBarberForm(!showBarberForm)}><Plus size={16} /> Novo barbeiro</button><button className="secondary-button" type="button" onClick={() => setShowScheduleForm(!showScheduleForm)}><Plus size={16} /> Nova escala</button></div>{showServiceForm && <form className="inline-form" onSubmit={saveService}><input placeholder="Nome do serviço" value={service.name} onChange={(event) => setService({ ...service, name: event.target.value })} required /><input placeholder="Categoria" value={service.category} onChange={(event) => setService({ ...service, category: event.target.value })} /><input placeholder="Descrição (opcional)" value={service.description} onChange={(event) => setService({ ...service, description: event.target.value })} /><input placeholder="Preço em reais" inputMode="decimal" value={service.price} onChange={(event) => setService({ ...service, price: event.target.value })} required /><input type="number" min="5" max="720" placeholder="Duração em minutos" value={service.duration} onChange={(event) => setService({ ...service, duration: event.target.value })} required /><button className="primary-button" type="submit">Salvar serviço</button></form>}{showBarberForm && <form className="inline-form" onSubmit={saveBarber}><input placeholder="Nome do barbeiro" value={barber.name} onChange={(event) => setBarber({ ...barber, name: event.target.value })} required /><input type="email" placeholder="E-mail de acesso" value={barber.email} onChange={(event) => setBarber({ ...barber, email: event.target.value })} required /><input type="password" minLength={8} placeholder="Senha inicial" value={barber.password} onChange={(event) => setBarber({ ...barber, password: event.target.value })} required /><input type="url" placeholder="URL pública da foto (opcional)" value={barber.photoUrl} onChange={(event) => setBarber({ ...barber, photoUrl: event.target.value })} /><button className="primary-button" type="submit">Cadastrar barbeiro</button></form>}{showScheduleForm && <form className="inline-form" onSubmit={saveSchedule}><select value={schedule.barberId} onChange={(event) => setSchedule({ ...schedule, barberId: event.target.value })} required><option value="">Escolha o barbeiro</option>{barbers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><select value={schedule.weekday} onChange={(event) => setSchedule({ ...schedule, weekday: event.target.value })}>{['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map((day, index) => <option value={index} key={day}>{day}</option>)}</select><input type="time" value={schedule.start} onChange={(event) => setSchedule({ ...schedule, start: event.target.value })} required /><input type="time" value={schedule.end} onChange={(event) => setSchedule({ ...schedule, end: event.target.value })} required /><button className="primary-button" type="submit">Salvar escala</button></form>}<div className="catalog-summary"><div><strong>{services.length}</strong><span>serviços ativos</span></div><div><strong>{barbers.length}</strong><span>barbeiros ativos</span></div></div></section>
      <section className="panel-card"><div className="card-heading"><div><span className="section-eyebrow">Equipe</span><h2>Profissionais cadastrados</h2></div><Users size={22} /></div><div className="barber-directory">{barbers.map((item) => <article className="barber-card" key={item.id}><BarberPhoto src={item.photoUrl} alt={`Foto de ${item.name}`} initials={item.initials} className="barber-avatar" fallbackClassName="barber-avatar" /><div><strong>{item.name}</strong><small>{item.specialty ?? 'Barbeiro'}</small></div></article>)}</div></section>
      <section className="panel-card"><div className="card-heading"><div><span className="section-eyebrow">Agenda</span><h2>Todos os atendimentos</h2></div><CalendarDays size={22} /></div><AppointmentList appointments={appointments} onAction={onAction} professional emptyTitle="Nenhum atendimento registrado." /></section>
    </div>
  )
}

function RevenueMetrics({ report, personal = false }: { report: RevenueReport | null; personal?: boolean }) {
  return <div className="metric-grid"><Metric label={personal ? 'Faturamento dos seus atendimentos' : 'Receita realizada'} value={formatCurrency(report?.revenue_cents ?? 0)} icon={<DollarSign size={18} />} /><Metric label="Atendimentos concluídos" value={String(report?.completed_count ?? 0)} icon={<Check size={18} />} /><Metric label={personal ? 'Sua comissão' : 'Comissões'} value={report?.commission_pending_count ? `${report.commission_pending_count} pendente(s)` : formatCurrency(report?.commission_cents ?? 0)} icon={<Users size={18} />} /></div>
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <article className="metric-card"><span className="metric-icon">{icon}</span><span className="metric-label">{label}</span><strong>{value}</strong></article>
}

function AppointmentList({ appointments, onAction, professional = false, emptyTitle }: { appointments: Appointment[]; onAction: (action: () => Promise<void>, success: string) => Promise<void>; professional?: boolean; emptyTitle: string }) {
  if (!appointments.length) return <EmptyState title={emptyTitle} text="Quando houver movimentação, ela aparecerá aqui automaticamente." />
  return <div className="appointment-list">{appointments.map((appointment) => <AppointmentRow appointment={appointment} key={appointment.id} onAction={onAction} professional={professional} />)}</div>
}

function AppointmentRow({ appointment, onAction, professional }: { appointment: Appointment; onAction: (action: () => Promise<void>, success: string) => Promise<void>; professional: boolean }) {
  const [busy, setBusy] = useState(false)
  const run = async (action: () => Promise<void>, message: string) => { setBusy(true); await onAction(action, message); setBusy(false) }
  return <article className="appointment-row"><div className="appointment-date"><strong>{formatDateTime(appointment.startsAt ?? appointment.date)}</strong><span>{appointment.durationMinutes ? `${appointment.durationMinutes} min` : ''}</span></div><div className="appointment-main"><strong>{appointment.serviceName ?? 'Serviço'}</strong><span>{professional ? `${appointment.clientName} · ${appointment.barberName ?? 'Profissional'}` : appointment.barberName ?? 'Equipe NA Barbearia'}</span></div><div className={`status-badge status-${appointment.status}`}>{statusLabels[appointment.status]}</div><div className="appointment-actions">{appointment.status === 'confirmed' && !professional && <button className="text-danger" type="button" disabled={busy} onClick={() => void run(() => api.cancelAppointment(appointment.id), 'Agendamento cancelado.')}>Cancelar</button>}{professional && appointment.status === 'confirmed' && <><button className="text-action" type="button" disabled={busy} onClick={() => void run(() => api.startAppointment(appointment.id), 'Atendimento iniciado.')}>Iniciar</button><button className="text-action" type="button" disabled={busy} onClick={() => void run(() => api.completeAppointment(appointment.id), 'Atendimento concluído.')}>Concluir</button><button className="text-danger" type="button" disabled={busy} onClick={() => void run(() => api.noShowAppointment(appointment.id), 'Atendimento marcado como falta.')}>Falta</button></>}</div></article>
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><CalendarDays size={28} /><strong>{title}</strong><p>{text}</p></div>
}
