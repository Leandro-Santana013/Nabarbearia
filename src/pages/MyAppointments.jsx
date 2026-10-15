import { useState } from "react"
import { ArrowLeft, Calendar, Clock, MapPin, MessageSquare, Scissors, Star, RotateCcw, CalendarX } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { siteConfig } from "@/config/siteConfig"
import { splitAppointments } from "@/lib/client-appointments"
import { clientError } from "@/lib/client-api"
function appointmentDate(appointment) {
  return `${new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${appointment.date}T12:00:00Z`))} às ${appointment.time}`
}

/** @param {import("./MyAppointments.types").MyAppointmentsProps} props */
export default function MyAppointments({
  appointments: controlledAppointments, isDemo = true, onBack, onNewBooking,
  onAppointmentsChange, onReschedule, onRebook, onCancel, onRate,
} = {}) {
  const [localAppointments, setLocalAppointments] = useState([])
  const [cancelId, setCancelId] = useState(null)
  const [pendingId, setPendingId] = useState(null)
  const [feedback, setFeedback] = useState("")
  const [error, setError] = useState("")
  const appointments = controlledAppointments ?? localAppointments
  const { upcoming, history } = splitAppointments(appointments)
  const newBooking = onNewBooking ?? (() => window.location.assign("/home"))
  const busy = pendingId !== null

  async function updateAppointment(appointment, changes) {
    if (busy) return
    setPendingId(appointment.id)
    setError("")
    setFeedback("")
    try {
      const next = appointments.map((item) => item.id === appointment.id ? { ...item, ...changes } : item)
      if (changes.status === "cancelled" && onCancel) await onCancel(appointment.id)
      else if (changes.rating && onRate) await onRate(appointment.id, changes.rating)
      else if (onAppointmentsChange) await onAppointmentsChange(next)
      else setLocalAppointments(next)
      setCancelId(null)
      setFeedback(changes.status === "cancelled" ? "Agendamento cancelado." : "Avaliação salva. Obrigado pelo feedback!")
    } catch (failure) {
      setError(clientError(failure))
    } finally {
      setPendingId(null)
    }
  }

  function BarberInfo({ barber }) {
    const initials = barber.name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("")
    return (
      <div className="flex items-center gap-3">
        <Avatar className="size-11 shrink-0">
          {barber.avatar && <AvatarImage src={barber.avatar} alt="" />}
          <AvatarFallback className="bg-accent font-semibold text-accent-foreground">{barber.isAny ? "NA" : initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold">{barber.isAny ? "Qualquer disponível" : barber.name}</p>
          <p className="mt-1 break-words text-xs text-muted-foreground">{barber.specialty}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-[#F4F4F6] font-sans text-[#111111] antialiased">
      <main className="mx-auto mb-20 max-w-2xl px-4 py-6">
        <header className="mb-6 grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2">
          <Button type="button" variant="ghost" size="icon" onClick={onBack ?? (() => window.history.back())} aria-label="Voltar ao início" className="size-11 rounded-full transition-colors"><ArrowLeft aria-hidden="true" className="size-5" /></Button>
          <h1 className="text-center text-base font-semibold">Meus Agendamentos</h1>
          <span aria-hidden="true" />
        </header>
        {isDemo && <p className="mb-4 text-center text-xs text-muted-foreground">Agenda demonstrativa. Alterações salvas nesta sessão.</p>}
        <Tabs defaultValue="upcoming">
          <TabsList aria-label="Listas de agendamentos">
            <TabsTrigger value="upcoming">Próximos <Badge className="rounded-full bg-accent text-accent-foreground">{upcoming.length}</Badge></TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
          </TabsList>
          <TabsContent value="upcoming">
            {upcoming.length === 0 ? (
              <Card className="rounded-3xl bg-white p-8 text-center shadow-sm">
                <CalendarX aria-hidden="true" className="mx-auto size-12 text-primary/60" />
                <h2 className="text-base font-semibold">Você não possui agendamentos futuros</h2>
                <Button type="button" onClick={newBooking} className="mx-auto min-h-12 gap-2 rounded-full bg-primary px-6 text-primary-foreground transition-colors"><Scissors aria-hidden="true" className="size-4" />Agendar um Corte</Button>
              </Card>
            ) : upcoming.map((appointment) => (
              <Card key={appointment.id} className="rounded-3xl border border-border bg-white p-5 shadow-sm ring-0">
                <CardContent className="space-y-4 p-0">
                  <Badge className="h-auto rounded-full bg-accent px-3 py-1 text-accent-foreground">Confirmado</Badge>
                  <p className="flex items-start gap-2 text-sm font-semibold"><Calendar aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" /><time dateTime={`${appointment.date}T${appointment.time}`} className="first-letter:uppercase">{appointmentDate(appointment)}</time></p>
                  <BarberInfo barber={appointment.barber} />
                  <div className="space-y-2 border-t border-border/60 pt-4">
                    <h2 className="break-words font-semibold">{appointment.service.title}</h2>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground"><span className="flex items-center gap-1.5"><Clock aria-hidden="true" className="size-4" />{appointment.service.duration}</span><span className="font-bold text-primary">{appointment.service.price}</span></div>
                  </div>
                  <p className="flex items-start gap-2 rounded-2xl bg-blue-50/70 p-3 text-xs leading-relaxed text-accent-foreground"><MessageSquare aria-hidden="true" className="size-4 shrink-0" />{isDemo ? "Demonstração de lembrete via WhatsApp" : appointment.whatsappReminderEnabled ? "Lembrete automático ativado via WhatsApp" : "Lembrete via WhatsApp não ativado"}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="ghost" disabled={busy} onClick={() => setCancelId(appointment.id)} className="min-h-11 rounded-full px-4 text-muted-foreground transition-colors">Cancelar</Button>
                    <Button type="button" variant="outline" disabled={busy} onClick={() => onReschedule ? onReschedule(appointment) : newBooking()} className="min-h-11 rounded-full px-4 transition-colors">Remarcar</Button>
                    <Button variant="default" nativeButton={false} render={<a href={siteConfig.address.mapsUrl} target="_blank" rel="noopener noreferrer" />} className="min-h-11 gap-2 rounded-full bg-primary px-4 text-primary-foreground transition-colors"><MapPin aria-hidden="true" className="size-4" />Ver Endereço<span className="sr-only"> (abre o mapa em nova aba)</span></Button>
                  </div>
                  {cancelId === appointment.id && (
                    <div role="group" aria-label="Confirmar cancelamento" className="space-y-3 rounded-2xl border border-border bg-muted/50 p-3">
                      <p className="text-sm">Deseja cancelar este agendamento?</p>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" disabled={busy} onClick={() => setCancelId(null)} className="min-h-11 rounded-full px-4 transition-colors">Manter horário</Button>
                        <Button type="button" variant="destructive" disabled={busy} onClick={() => updateAppointment(appointment, { status: "cancelled" })} className="min-h-11 rounded-full px-4 transition-colors">{pendingId === appointment.id ? "Cancelando…" : "Confirmar cancelamento"}</Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>
          <TabsContent value="history">
            {history.length === 0 && <Card className="rounded-2xl bg-white p-6 text-center text-sm text-muted-foreground">Seu histórico de agendamentos aparecerá aqui.</Card>}
            {history.map((appointment) => (
              <Card key={appointment.id} className="rounded-2xl border border-border/60 bg-white p-4 shadow-sm ring-0">
                <CardContent className="space-y-3 p-0">
                  <Badge className={`h-auto rounded-full px-3 py-1 ${appointment.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{appointment.status === "completed" ? "Concluído" : appointment.status === "cancelled" ? "Cancelado" : appointment.status === "no-show" ? "Não compareceu" : "Encerrado"}</Badge>
                  <p className="text-xs text-muted-foreground first-letter:uppercase"><time dateTime={`${appointment.date}T${appointment.time}`}>{appointmentDate(appointment)}</time></p>
                  <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h2 className="break-words text-sm font-semibold">{appointment.service.title}</h2><p className="mt-1 text-xs text-muted-foreground">{appointment.barber.isAny ? "Qualquer disponível" : appointment.barber.name}</p></div><span className="text-sm font-bold text-primary">{appointment.service.price}</span></div>
                  <Button type="button" variant="ghost" disabled={busy} onClick={() => onRebook ? onRebook(appointment) : newBooking()} className="min-h-11 gap-2 rounded-full px-3 text-primary transition-colors"><RotateCcw aria-hidden="true" className="size-4" />Agendar Novamente</Button>
                  {appointment.status === "completed" && (
                    <div role="group" aria-label={`Avaliar ${appointment.service.title} de ${appointment.date}`} className="border-t border-border/60 pt-3">
                      <p className="mb-1 text-xs text-muted-foreground">Como foi seu atendimento?</p>
                      <div className="flex flex-wrap items-center gap-1">
                        {[1, 2, 3, 4, 5].map((rating) => <Button key={rating} type="button" variant="ghost" size="icon" disabled={busy || Boolean(appointment.rating)} aria-label={`Avaliar com ${rating} ${rating === 1 ? "estrela" : "estrelas"}`} aria-pressed={appointment.rating === rating} onClick={() => updateAppointment(appointment, { rating })} className="size-11 rounded-full transition-colors"><Star aria-hidden="true" className={`size-5 ${rating <= (appointment.rating ?? 0) ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} /></Button>)}
                        {appointment.rating && <span className="text-xs text-muted-foreground">{appointment.rating}/5</span>}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        {feedback && <p role="status" className="mt-4 text-sm text-accent-foreground">{feedback}</p>}
      </main>
    </div>
  )
}
