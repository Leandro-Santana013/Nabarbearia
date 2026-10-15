import { useId, useState } from "react"
import { CalendarX, Check, ChevronDown, Clock, MessageSquare, Play, Scissors } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { WHATSAPP_URL } from "@/data/barbershopData"
import { isAppointmentInProgress, money, scheduleTime, shopDate, sortBarberAppointments } from "@/lib/barber-schedule"

const STATUS = {
  confirmed: { label: "Agendado", className: "bg-blue-50 text-blue-700" },
  started: { label: "Em Atendimento", className: "bg-amber-50 text-amber-700" },
  completed: { label: "Concluído", className: "bg-emerald-50 text-emerald-700" },
  cancelled: { label: "Cancelado", className: "bg-gray-100 text-gray-500" },
  "no-show": { label: "Não compareceu", className: "bg-gray-100 text-gray-500" },
}

/** @param {import("./BarberDashboard.types").BarberScheduleProps} props */
export default function BarberSchedule({ appointments, startedIds, date, barberName, busy, onStart, onComplete, onNoShow, onSaveDetails, loading = false, loadFailed = false }) {
  const id = useId()
  const [confirmNoShow, setConfirmNoShow] = useState(null)
  const sorted = sortBarberAppointments(appointments, startedIds)
  const pending = sorted.filter((item) => item.status === "confirmed")
  const inactive = sorted.filter((item) => item.status === "cancelled" || item.status === "no-show")
  const completed = sorted.filter((item) => item.status === "completed")
  const renderAppointment = (appointment) => {
    const inProgress = isAppointmentInProgress(appointment, startedIds)
    const status = STATUS[inProgress ? "started" : appointment.status]
    const digits = appointment.clientPhone?.replace(/\D/g, "")
    const directPhone = digits && (digits.length === 10 || digits.length === 11 ? `55${digits}` : digits)
    const contactUrl = `${directPhone ? `https://wa.me/${directPhone}` : WHATSAPP_URL}?text=${encodeURIComponent(`Olá! Sou ${barberName}. Preciso falar sobre o atendimento de ${appointment.clientName} em ${date.split("-").reverse().join("/")} às ${scheduleTime(appointment.startsAt ?? appointment.date)}: ${appointment.serviceName ?? "Serviço"}.`)}`
    return (
      <Card key={appointment.id} className={`gap-0 rounded-2xl border-2 bg-white p-3.5 shadow-sm ring-0 ${inProgress ? "border-amber-400" : "border-transparent"}`}>
        <CardContent className="space-y-2.5 p-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <time dateTime={appointment.startsAt ?? appointment.date} className="rounded-lg bg-gray-100 px-2 py-1 text-xs font-semibold">{scheduleTime(appointment.startsAt ?? appointment.date)}</time>
              <Badge className={`h-auto rounded-full border-0 px-2 py-0.5 text-[11px] font-medium ${status.className}`}>{status.label}</Badge>
            </div>
            <div className="text-right"><span className="text-xs font-bold text-primary">{money(appointment.amountCents)}</span><p className="mt-0.5 text-[10px] text-gray-400">{appointment.paymentMethod ? `${appointment.paymentMethod} · previsto` : "Pagamento não informado"}</p></div>
          </div>
          <div className="space-y-1">
            <h3 className="break-words text-sm font-semibold">{appointment.clientName}</h3>
            <p className="break-words text-xs leading-relaxed text-gray-500">{appointment.serviceName ?? "Serviço agendado"}</p>
            {appointment.durationMinutes && <p className="flex items-center gap-1 text-[11px] text-gray-500"><Clock aria-hidden="true" className="size-3" />{appointment.durationMinutes} min</p>}
          </div>
          {appointment.clientNote && <p className="w-fit max-w-full break-words rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800"><span aria-hidden="true">💡 </span>Obs: {appointment.clientNote}</p>}
          <AppointmentDetails key={`${appointment.id}-${appointment.clientPhone}-${appointment.paymentMethod}-${appointment.clientNote}`} appointment={appointment} busy={busy} onSave={onSaveDetails} />
          {confirmNoShow === appointment.id && <div role="group" aria-label="Confirmar falta" className="space-y-2 rounded-xl bg-red-50 p-3 text-xs text-red-700"><p>Registrar que {appointment.clientName} não compareceu?</p><div className="flex gap-2"><Button disabled={busy} variant="outline" className="min-h-10 rounded-lg text-xs!" onClick={() => setConfirmNoShow(null)}>Voltar</Button><Button disabled={busy} variant="destructive" className="min-h-10 rounded-lg text-xs!" onClick={() => { onNoShow(appointment); setConfirmNoShow(null) }}>Registrar falta</Button></div></div>}
          <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-2">
            {appointment.status === "confirmed" && (
              <Button type="button" disabled={busy} onClick={() => inProgress ? onComplete(appointment) : onStart(appointment)} className={`min-h-10 min-w-0 flex-1 gap-1.5 rounded-xl px-3 py-2 text-xs! font-semibold! whitespace-normal text-white transition-colors ${inProgress ? "bg-emerald-600 hover:bg-emerald-700" : "bg-primary hover:bg-primary/90"}`}>
                {inProgress ? <><Check aria-hidden="true" className="size-4" />Concluir Serviço</> : <><Play aria-hidden="true" className="size-3.5" />Iniciar Atendimento</>}
              </Button>
            )}
            {appointment.status === "confirmed" && !inProgress && <Button disabled={busy} variant="outline" onClick={() => setConfirmNoShow(appointment.id)} className="min-h-10 rounded-xl px-3 text-xs! text-red-600">Falta</Button>}
            <Button variant="outline" nativeButton={false} render={<a href={contactUrl} target="_blank" rel="noopener noreferrer" />} aria-label={`${directPhone ? "Falar com" : "Falar com a recepção sobre"} ${appointment.clientName} pelo WhatsApp (nova aba)`} className="min-h-10 gap-1.5 rounded-xl border-gray-200 bg-gray-50 px-3 py-2 text-xs! font-medium! text-gray-600 transition-colors"><MessageSquare aria-hidden="true" className="size-4" />{directPhone ? "WhatsApp" : "Recepção"}</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-heading`} className="text-sm font-semibold">{date === shopDate() ? "Agenda de Hoje" : "Agenda do Dia"}</h2>
        <span className="text-xs text-muted-foreground">{appointments.length} agendamentos</span>
      </div>

      {loading ? <p role="status" className="rounded-2xl bg-white p-5 text-center text-sm text-muted-foreground">Carregando agenda…</p> : !loadFailed && (pending.length > 0 ? renderAppointment(pending[0]) : (
        <Card className="gap-2 rounded-2xl bg-white p-4 text-center shadow-sm">
          <CalendarX aria-hidden="true" className="mx-auto size-6 text-primary/60" />
          <h3 className="text-sm font-semibold">{appointments.length === 0 ? "Nenhum atendimento nesta data" : "Nenhum atendimento pendente"}</h3>
          <p className="text-xs text-muted-foreground">{appointments.length === 0 ? "Os agendamentos da sua agenda aparecerão aqui." : "Consulte os atendimentos encerrados abaixo."}</p>
        </Card>
      ))}
      {!loading && <>
        {pending.length > 1 && <details className="rounded-2xl border border-border/60 bg-white p-3"><summary className="min-h-8 cursor-pointer text-xs font-semibold text-muted-foreground">Próximos da agenda ({pending.length - 1})</summary><div className="mt-2 space-y-3">{pending.slice(1).map(renderAppointment)}</div></details>}
        {inactive.length > 0 && <details className="rounded-2xl border border-border/60 bg-white p-3"><summary className="min-h-8 cursor-pointer text-xs font-semibold text-muted-foreground">Faltas e cancelamentos ({inactive.length})</summary><div className="mt-2 space-y-3">{inactive.map(renderAppointment)}</div></details>}
      </>}
      {!loading && completed.length > 0 && <details key={date} className="group rounded-2xl border border-border/60 bg-white p-3.5">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
          <span>Atendimentos Concluídos ({completed.length})</span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground group-open:rotate-180" />
        </summary>
        <div className="mt-3 space-y-3">{completed.map(renderAppointment)}</div>
      </details>}
      <p className="text-[11px] leading-relaxed text-muted-foreground"><Scissors aria-hidden="true" className="mr-1 inline size-3" />Horários de Brasília. Os valores representam o preço dos serviços.</p>
    </section>
  )
}

function AppointmentDetails({ appointment, busy, onSave }) {
  const [open, setOpen] = useState(false)
  const [phone, setPhone] = useState(appointment.clientPhone ?? "")
  const [note, setNote] = useState(appointment.clientNote ?? "")
  const [payment, setPayment] = useState(appointment.paymentMethod ?? "")
  const field = "h-11 rounded-xl bg-white text-sm!"
  return <div>
    <Button type="button" variant="link" disabled={busy} aria-expanded={open} onClick={() => setOpen(!open)} className="min-h-10 p-0 text-[11px]!">{open ? "Fechar detalhes" : "Editar contato, pagamento e observações"}</Button>
    {open && <form className="space-y-2 rounded-xl bg-gray-50 p-3" onSubmit={async (event) => {
      event.preventDefault()
      if (await onSave(appointment, { client_phone: phone.replace(/\D/g, "") || undefined, payment_method: payment || undefined, client_note: note.trim() || undefined })) setOpen(false)
    }}>
      <fieldset disabled={busy} className="space-y-2">
        <label className="block space-y-1 text-xs font-medium">WhatsApp do cliente<Input type="tel" value={phone} maxLength={20} onChange={(event) => setPhone(event.target.value)} placeholder="DDD + número" className={field} /></label>
        <label className="block space-y-1 text-xs font-medium">Pagamento previsto<select value={payment} onChange={(event) => setPayment(event.target.value)} className={`w-full ${field}`}><option value="">Não informado</option>{["Pix", "Cartão", "Presencial"].map((method) => <option key={method}>{method}</option>)}</select></label>
        <label className="block space-y-1 text-xs font-medium">Observações<Input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} className={field} /></label>
        <Button type="submit" className="min-h-10 rounded-xl text-xs!">Salvar detalhes</Button>
      </fieldset>
    </form>}
  </div>
}
