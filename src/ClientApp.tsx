import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Home from './pages/Home'
import ServiceDetail from './pages/ServiceDetail'
import DateTimeSelection from './pages/DateTimeSelection'
import BookingSuccess from './pages/BookingSuccess'
import MyAppointments from './pages/MyAppointments'
import UserProfile from './pages/UserProfile'
import LoginScreen from './pages/LoginScreen'
import { Button } from './components/ui/button'
import { Alert, AlertDescription } from './components/ui/alert'
import { ApiError, api, type AuthResponse } from './services/api'
import { appointmentFromApi, barbersFromApi, catalogFromApi, clientError } from './lib/client-api'
import { splitAppointments } from './lib/client-appointments'
import { toServiceInfo } from './data/bookingCatalog'
import type { Appointment } from './types'
import type { CatalogService } from './data/barbershopData'
import type { Barber, ServiceInfo } from './pages/ServiceDetail.types'
import type { BookingReview, DateTimeChoice } from './pages/DateTimeSelection.types'
import type { ClientAppointment } from './pages/MyAppointments.types'

const ANY_BARBER: Barber = { id: 'any', name: 'Qualquer disponível', specialty: 'Barbeiro(a)', isAny: true }

export default function ClientApp({ path, onNavigate }: { path: string; onNavigate: (path: string) => void }) {
  const [session, setSession] = useState<AuthResponse | null>(null)
  const [services, setServices] = useState<CatalogService[]>([])
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [records, setRecords] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [booking, setBooking] = useState<{ service: ServiceInfo; barber: Barber } | null>(null)
  const [dateTime, setDateTime] = useState<DateTimeChoice>({ date: '', time: '' })
  const [completed, setCompleted] = useState<ClientAppointment | null>(null)
  const [reschedulingId, setReschedulingId] = useState<string | null>(null)
  const requestId = useRef(0)
  const idempotency = useRef<{ fingerprint: string; key: string } | null>(null)

  const refresh = useCallback(async () => {
    const request = ++requestId.current
    setLoading(true)
    setError('')
    try {
      const [auth, serviceList, barberList] = await Promise.all([api.authSession(), api.getPublicServices(), api.getPublicBarbers()])
      if (request !== requestId.current) return
      if (auth && !auth.user.roles.includes('client')) {
        onNavigate(auth.user.roles.includes('owner') ? '/painel' : '/barbeiro')
        return
      }
      setSession(auth)
      setServices(catalogFromApi(serviceList))
      setBarbers(barbersFromApi(barberList))
      if (auth) {
        const appointments = await api.listAppointments()
        if (request === requestId.current) setRecords(appointments.filter((item) => item.clientUserId === auth.user.id))
      } else setRecords([])
    } catch (failure) {
      if (request === requestId.current) {
        if (failure instanceof ApiError && failure.status === 401) { setSession(null); setRecords([]) }
        setError(clientError(failure))
      }
    } finally {
      if (request === requestId.current) setLoading(false)
    }
  }, [onNavigate])

  useEffect(() => {
    void refresh()
    return () => { requestId.current += 1 }
  }, [refresh])

  const appointments = useMemo(() => records.map((item) => appointmentFromApi(item, barbers)), [records, barbers])
  const { upcoming } = splitAppointments(appointments)
  const successId = new URLSearchParams(window.location.search).get('id')
  const success = completed?.id === successId ? completed : appointments.find((item) => item.id === successId && item.status === 'confirmed')

  function chooseService(service: CatalogService) {
    setBooking({ service: toServiceInfo(service), barber: ANY_BARBER })
    setDateTime({ date: '', time: '' })
    setCompleted(null)
    setReschedulingId(null)
    idempotency.current = null
    onNavigate('/servico')
  }

  function reuseAppointment(appointment: ClientAppointment, reschedule = false) {
    const service = services.find((item) => item.id === appointment.service.id)
    if (!service) { setError('Este serviço não está mais disponível no catálogo. Escolha outro serviço.'); return }
    const barber = barbers.find((item) => item.id === appointment.barber.id)
    if (reschedule && !barber) { setError('Este profissional não está disponível para remarcação. Fale com a recepção.'); return }
    setBooking({ service: reschedule ? appointment.service : toServiceInfo(service), barber: barber ?? ANY_BARBER })
    setDateTime({ date: reschedule ? appointment.date : '', time: '' })
    setReschedulingId(reschedule ? appointment.id : null)
    setCompleted(null)
    idempotency.current = null
    onNavigate(reschedule ? '/horarios' : '/servico')
  }

  const loadAvailability = useCallback(async (date: string) => {
    if (!booking?.service.id) return []
    return api.getAvailability(booking.service.id, date, booking.barber.isAny ? undefined : booking.barber.id)
  }, [booking?.service.id, booking?.barber.id, booking?.barber.isAny])

  async function confirmBooking(review: BookingReview) {
    if (!session || !review.startsAt || !review.barberId || !review.service.id) throw new Error('Escolha um horário válido para continuar.')
    const chosen = barbers.find((barber) => barber.id === review.barberId)
    if (!chosen) throw new Error('Profissional indisponível.')
    try {
      let saved: Appointment
      if (reschedulingId) saved = await api.rescheduleAppointment(reschedulingId, review.startsAt)
      else {
        const fingerprint = `${session.user.id}:${review.service.id}:${review.barberId}:${review.startsAt}`
        if (idempotency.current?.fingerprint !== fingerprint) idempotency.current = { fingerprint, key: crypto.randomUUID() }
        saved = await api.bookAppointment({ barber_user_id: review.barberId, service_id: review.service.id, starts_at: review.startsAt }, idempotency.current.key)
      }
      saved = { ...saved, serviceName: saved.serviceName ?? review.service.title, barberName: saved.barberName ?? chosen.name }
      setRecords((previous) => [saved, ...previous.filter((item) => item.id !== saved.id)])
      setCompleted(appointmentFromApi(saved, barbers))
      setReschedulingId(null)
      onNavigate(`/confirmacao?id=${encodeURIComponent(saved.id)}`)
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) { setSession(null); setRecords([]) }
      throw failure
    }
  }

  async function cancelAppointment(id: string) {
    try {
      await api.cancelAppointment(id)
      setRecords((previous) => previous.map((item) => item.id === id ? { ...item, status: 'cancelled' } : item))
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) { setSession(null); setRecords([]); setError(clientError(failure)) }
      throw failure
    }
  }
  async function rateAppointment(id: string, rating: number) {
    try {
      await api.rateAppointment(id, rating)
      setRecords((previous) => previous.map((item) => item.id === id ? { ...item, rating } : item))
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) { setSession(null); setRecords([]); setError(clientError(failure)) }
      if (failure instanceof ApiError && failure.code === 'RATING_EXISTS') void refresh()
      throw failure
    }
  }
  async function logout() {
    await api.logout()
    setSession(null)
    setRecords([])
    setBooking(null)
    setCompleted(null)
    setReschedulingId(null)
    idempotency.current = null
    onNavigate('/login')
  }

  if (loading) return <main role="status" className="flex min-h-dvh items-center justify-center bg-background p-5 text-sm text-muted-foreground">Carregando sua barbearia…</main>
  const needsLogin = ['/perfil', '/meus-agendamentos', '/horarios', '/confirmacao'].includes(path)
  if (needsLogin && !session) return <LoginScreen initialError={error} onAuthenticated={() => { void refresh() }} onGuest={() => onNavigate('/home')} />

  let page
  if (path === '/home' || path === '/mobile') {
    const notifications = upcoming.map((item) => ({ id: item.id, type: 'appointment' as const, title: 'Agendamento confirmado',
      description: `${item.service.title} com ${item.barber.name}, em ${item.date.split('-').reverse().join('/')} às ${item.time}.`, time: 'Próximo atendimento', read: false }))
    page = <Home services={services} userName={session?.user.display_name ?? 'Visitante'} isAuthenticated={Boolean(session)}
      activeAppointmentCount={upcoming.length} notifications={notifications} onNotificationDetails={() => onNavigate('/meus-agendamentos')}
      onSignIn={() => onNavigate('/login')} onEditProfile={() => onNavigate('/perfil')} onLogout={logout}
      onViewAppointments={() => onNavigate('/meus-agendamentos')} onSelectService={chooseService} />
  } else if (path === '/meus-agendamentos') {
    page = <MyAppointments appointments={appointments} isDemo={false} onCancel={cancelAppointment} onRate={rateAppointment}
      onBack={() => onNavigate('/home')} onNewBooking={() => onNavigate('/home')}
      onReschedule={(appointment) => reuseAppointment(appointment, true)} onRebook={(appointment) => reuseAppointment(appointment)} />
  } else if (path === '/perfil' && session) {
    const completedAppointments = appointments.filter((item) => item.status === 'completed')
    const favorites = new Map<string, { count: number; name: string }>()
    for (const item of completedAppointments) {
      const existing = favorites.get(item.barber.id)
      favorites.set(item.barber.id, { count: (existing?.count ?? 0) + 1, name: item.barber.name })
    }
    const favorite = [...favorites.values()].sort((a, b) => b.count - a.count)[0]?.name ?? ''
    page = <UserProfile key={session.user.id} profile={{ name: session.user.display_name, email: session.user.email, phone: '',
      completedCuts: completedAppointments.length, activeAppointments: upcoming.length, favoriteBarber: favorite, remindersEnabled: false }}
      isDemo={false} accountEditable={false} remindersAvailable={false} onBack={() => onNavigate('/home')}
      onViewAppointments={() => onNavigate('/meus-agendamentos')} onLogout={logout} />
  } else if (path === '/confirmacao' && success) {
    page = <BookingSuccess booking={success} isDemo={false} whatsappStatus="unavailable" onViewAppointments={() => onNavigate('/meus-agendamentos')} onGoHome={() => onNavigate('/home')} />
  } else if ((path === '/servico' || path === '/detalhes') && booking) {
    page = <ServiceDetail key={booking.service.id} service={booking.service} barbers={barbers} initialBarberId={booking.barber.id}
      onBack={() => onNavigate('/home')} onSelectSchedule={(barber, service) => { setBooking({ barber, service }); setDateTime({ date: '', time: '' }); onNavigate('/horarios') }} />
  } else if (path === '/horarios' && booking) {
    page = <DateTimeSelection key={`${booking.service.id}:${booking.barber.id}:${reschedulingId ?? ''}`} service={booking.service} barber={booking.barber}
      initialDate={dateTime.date} initialTime={dateTime.time} onSelectionChange={setDateTime} loadAvailability={loadAvailability} lockBarber={Boolean(reschedulingId)}
      onBack={() => onNavigate(reschedulingId ? '/meus-agendamentos' : '/servico')} onChangeBarber={() => onNavigate('/servico')} onConfirm={confirmBooking} />
  } else {
    page = <main className="mx-auto max-w-md space-y-4 px-4 py-8 text-center"><h1 className="text-lg font-semibold">Escolha um serviço para continuar</h1><Button type="button" onClick={() => onNavigate('/home')} className="min-h-11 rounded-xl px-5">Ver serviços</Button></main>
  }

  return <>{error && <Alert variant="destructive" className="mx-auto mt-4 max-w-xl rounded-xl border-destructive/20 bg-white p-3"><AlertDescription>{error}</AlertDescription><Button type="button" variant="outline" onClick={() => { void refresh() }} className="mt-2 min-h-10 rounded-xl px-3">Atualizar dados</Button></Alert>}{page}</>
}
