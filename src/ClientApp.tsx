import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import Home from './pages/Home'
import ServiceDetail from './pages/ServiceDetail'
import DateTimeSelection from './pages/DateTimeSelection'
import BookingSuccess from './pages/BookingSuccess'
import MyAppointments from './pages/MyAppointments'
import UserProfile from './pages/UserProfile'
import LoginScreen from './pages/LoginScreen'
import { Button } from './components/ui/button'
import { Alert, AlertDescription } from './components/ui/alert'
import { ApiError, api } from './services/api'
import { useAccess } from './lib/access/AccessProvider'
import { publicHome } from './lib/access/routing'
import { AccessDenied } from './lib/access/AccessScreen'
import { appointmentFromApi, barbersFromApi, catalogFromApi, clientError } from './lib/client-api'
import { splitAppointments } from './lib/client-appointments'
import { BookingError, createReservation, serviceForDisplay } from './lib/booking/reservation'
import type { Appointment } from './types'
import type { CatalogService } from './data/barbershopData'
import type { Barber } from './pages/ServiceDetail.types'
import type { BookingReview } from './pages/DateTimeSelection.types'
import type { ClientAppointment } from './pages/MyAppointments.types'

export default function ClientApp({ path, onNavigate }: { path: string; onNavigate: (path: string) => void }) {
  const { session, refresh: refreshSession, logout: logoutSession, accept, notice } = useAccess()
  const [services, setServices] = useState<CatalogService[]>([])
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [records, setRecords] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const userId = useRef<string | null>(null)
  userId.current = session?.user.id ?? null
  const [reservation] = useState(() => createReservation(api, () => userId.current))
  const { draft: booking, choice: dateTime } = useSyncExternalStore(reservation.subscribe, reservation.getSnapshot, reservation.getSnapshot)
  const bookingService = booking ? serviceForDisplay(booking.service) : null
  const [completed, setCompleted] = useState<ClientAppointment | null>(null)
  const reschedulingId = booking?.mode.kind === 'reschedule' ? booking.mode.appointmentId : null
  const requestId = useRef(0)

  const refresh = useCallback(async () => {
    const request = ++requestId.current
    setLoading(true)
    setError('')
    try {
      const [auth, serviceList, barberList] = await Promise.all([refreshSession(), api.getPublicServices(), api.getPublicBarbers()])
      if (request !== requestId.current) return
      if (auth && !auth.user.roles.includes('client')) {
        const destination = publicHome(auth.user)
        if (destination) onNavigate(destination)
        return
      }
      reservation.setCatalog(serviceList, barberList)
      setServices(catalogFromApi(serviceList))
      setBarbers(barbersFromApi(barberList))
      if (auth) {
        const appointments = await api.listAppointments()
        if (request === requestId.current) setRecords(appointments.filter((item) => item.clientUserId === auth.user.id))
      } else setRecords([])
    } catch (failure) {
      if (request === requestId.current) {
        if (failure instanceof ApiError && failure.status === 401) setRecords([])
        setError(clientError(failure))
      }
    } finally {
      if (request === requestId.current) setLoading(false)
    }
  }, [onNavigate, refreshSession, reservation])

  useEffect(() => {
    void refresh()
    return () => { requestId.current += 1 }
  }, [refresh])

  useEffect(() => { setRecords([]); setCompleted(null) }, [session?.user.id])

  const appointments = useMemo(() => records.filter((item) => item.clientUserId === session?.user.id).map((item) => appointmentFromApi(item, barbers)), [records, barbers, session?.user.id])
  const { upcoming } = splitAppointments(appointments)
  const successId = new URLSearchParams(window.location.search).get('id')
  const success = completed?.id === successId ? completed : appointments.find((item) => item.id === successId && item.status === 'confirmed')

  function chooseService(service: CatalogService) {
    try {
      reservation.start(service.id)
      setCompleted(null)
      onNavigate('/servico')
    } catch (failure) { setError(clientError(failure)) }
  }

  function reuseAppointment(appointment: ClientAppointment, reschedule = false) {
    try {
      const record = records.find((item) => item.id === appointment.id && item.clientUserId === session?.user.id)
      if (!record) throw new BookingError('Agendamento não encontrado. Atualize seus agendamentos.')
      reservation.reuse(record, reschedule)
      setCompleted(null)
      onNavigate(reschedule ? '/horarios' : '/servico')
    } catch (failure) { setError(clientError(failure)) }
  }

  function selectProfessional(barber: Barber) {
    try { reservation.selectProfessional(barber.id); onNavigate('/horarios') }
    catch (failure) { setError(clientError(failure)) }
  }

  async function confirmBooking(review: BookingReview) {
    const saved = await reservation.confirm(review)
    setRecords((previous) => [saved, ...previous.filter((item) => item.id !== saved.id)])
    setCompleted(appointmentFromApi(saved, barbers))
    onNavigate(`/confirmacao?id=${encodeURIComponent(saved.id)}`)
  }

  async function cancelAppointment(id: string) {
    try {
      await api.cancelAppointment(id)
      setRecords((previous) => previous.map((item) => item.id === id ? { ...item, status: 'cancelled' } : item))
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) { setRecords([]); setError(clientError(failure)) }
      throw failure
    }
  }
  async function rateAppointment(id: string, rating: number) {
    try {
      await api.rateAppointment(id, rating)
      setRecords((previous) => previous.map((item) => item.id === id ? { ...item, rating } : item))
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) { setRecords([]); setError(clientError(failure)) }
      if (failure instanceof ApiError && failure.code === 'RATING_EXISTS') void refresh()
      throw failure
    }
  }
  async function logout() {
    await logoutSession()
    setRecords([])
    reservation.clear()
    setCompleted(null)
  }

  if (loading) return <main role="status" className="flex min-h-dvh items-center justify-center bg-background p-5 text-sm text-muted-foreground">Carregando sua barbearia…</main>
  if (session && !publicHome(session.user)) return <AccessDenied />
  const needsLogin = ['/perfil', '/meus-agendamentos', '/horarios', '/confirmacao'].includes(path)
  if (needsLogin && !session) return <LoginScreen key={notice} initialError={error || notice} onAuthenticated={(value) => { accept(value); void refresh() }} onGuest={() => onNavigate('/home')} />

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
  } else if ((path === '/servico' || path === '/detalhes') && booking && bookingService) {
    page = <ServiceDetail key={booking.service.id} service={bookingService} barbers={barbers} initialBarberId={booking.barber.id}
      onBack={() => onNavigate('/home')} onSelectSchedule={selectProfessional} />
  } else if (path === '/horarios' && booking && bookingService) {
    page = <DateTimeSelection key={`${booking.service.id}:${booking.barber.id}:${reschedulingId ?? ''}`} service={bookingService} barber={booking.barber}
      initialDate={dateTime.date} initialTime={dateTime.time} onSelectionChange={reservation.setChoice} loadAvailability={reservation.loadAvailability} lockBarber={Boolean(reschedulingId)}
      onBack={() => onNavigate(reschedulingId ? '/meus-agendamentos' : '/servico')} onChangeBarber={() => onNavigate('/servico')} onConfirm={confirmBooking} />
  } else {
    page = <main className="mx-auto max-w-md space-y-4 px-4 py-8 text-center"><h1 className="text-lg font-semibold">Escolha um serviço para continuar</h1><Button type="button" onClick={() => onNavigate('/home')} className="min-h-11 rounded-xl px-5">Ver serviços</Button></main>
  }

  return <>{error && <Alert variant="destructive" className="mx-auto mt-4 max-w-xl rounded-xl border-destructive/20 bg-white p-3"><AlertDescription>{error}</AlertDescription><Button type="button" variant="outline" onClick={() => { void refresh() }} className="mt-2 min-h-10 rounded-xl px-3">Atualizar dados</Button></Alert>}{page}</>
}
