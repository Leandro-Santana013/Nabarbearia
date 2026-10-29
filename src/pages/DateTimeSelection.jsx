import { useId, useRef, useState } from "react"
import { ArrowLeft, Calendar, Clock, ArrowRight, Check } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

import { DEFAULT_SERVICE, DEFAULT_BARBER } from "@/data/bookingCatalog"
import { useBookingSelection } from "@/lib/booking/useBookingSelection"
import { formatShopDate as formatDate } from "@/lib/shop-calendar"
export { getDateOptions, getTimeSlots } from "@/lib/booking/availability"

const PERIODS = [{ id: "all", label: "Todos" }, { id: "morning", label: "Manhã" }, { id: "afternoon", label: "Tarde" }, { id: "evening", label: "Noite" }]

/** @param {import("./DateTimeSelection.types").DateTimeSelectionProps} props */
export default function DateTimeSelection({
  service = DEFAULT_SERVICE, barber = DEFAULT_BARBER,
  initialDate = "", initialTime = "", onBack, onChangeBarber, onSelectionChange, onReview, onConfirm, loadAvailability, lockBarber = false,
} = {}) {
  const { days, date: selectedDate, time: selectedTime, loading, slotError, confirming, confirmError, slots, selection } = useBookingSelection({ service, barber, initialDate, initialTime, onSelectionChange, onConfirm, loadAvailability })
  const [period, setPeriod] = useState("all")
  const [showReview, setShowReview] = useState(false)
  const reviewRef = useRef(null)
  const id = useId()
  const visibleSlots = slots.filter((slot) => period === "all" || slot.period === period)
  const canContinue = Boolean(!loading && !slotError && selectedDate && slots.some((slot) => slot.time === selectedTime && !slot.disabled))
  const barberName = barber.isAny ? "Qualquer disponível" : barber.name
  const initials = barber.name.split(" ").filter(Boolean).map((part) => part[0]).slice(0, 2).join("")
  const summary = canContinue
    ? `${formatDate(selectedDate, { weekday: "short", day: "numeric", month: "short" })} às ${selectedTime}`
    : "Selecione um dia e horário"
  const goBack = onBack ?? (() => window.history.back())

  function chooseDate(date) {
    if (date === selectedDate) return
    selection.selectDate(date)
    setShowReview(false)
  }

  function chooseTime(time) {
    selection.selectTime(time)
    setShowReview(false)
  }

  function handleReview() {
    const review = selection.review()
    if (!review) { setShowReview(false); return }
    if (onReview) onReview(review)
    else {
      setShowReview(true)
      requestAnimationFrame(() => reviewRef.current?.focus())
    }
  }

  return (
    <div className="min-h-dvh bg-background font-sans text-foreground antialiased">
      <main className="mx-auto max-w-2xl px-4 py-6 pb-[calc(8rem+env(safe-area-inset-bottom))]">
        <header className="mb-6 grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2">
          <Button type="button" variant="ghost" size="icon" disabled={confirming} onClick={goBack} aria-label="Voltar para a seleção de barbeiro" className="size-11 rounded-full transition-colors">
            <ArrowLeft aria-hidden="true" className="size-5" />
          </Button>
          <h1 className="text-center text-base font-semibold sm:text-lg">Escolher Data e Horário</h1>
          <span aria-hidden="true" />
        </header>

        <Card className="mb-6 rounded-2xl bg-card p-4 shadow-sm">
          <CardContent className="space-y-4 p-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="min-w-0 break-words text-base font-semibold">{service.title}</h2>
              <span className="font-bold text-primary">{service.price}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Clock aria-hidden="true" className="size-4" />
              <span>{service.duration}</span>
              <Badge className="ml-auto h-auto rounded-full bg-accent px-3 py-1 text-accent-foreground">Consultar disponibilidade</Badge>
            </div>
            <div className="flex items-center gap-3 border-t border-border pt-4">
              <Avatar className="size-10">
                {barber.avatar && <AvatarImage src={barber.avatar} alt="" />}
                <AvatarFallback className="bg-accent font-semibold text-accent-foreground">{barber.isAny ? "NA" : initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Profissional</p>
                <p className="break-words text-sm font-semibold">{barberName}</p>
              </div>
              <Button type="button" variant="ghost" disabled={confirming || lockBarber} onClick={onChangeBarber ?? goBack} className="min-h-11 rounded-full px-3 text-primary transition-colors">Alterar</Button>
            </div>
          </CardContent>
        </Card>

        <section aria-labelledby={`${id}-day-heading`} className="mb-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id={`${id}-day-heading`} className="flex items-center gap-2 text-sm font-semibold">
              <Calendar aria-hidden="true" className="size-4 text-primary" /> Selecione o Dia
            </h2>
            <span className="text-xs capitalize text-muted-foreground">{formatDate(selectedDate, { month: "long", year: "numeric" })}</span>
          </div>
          <div role="group" aria-labelledby={`${id}-day-heading`} className="flex snap-x gap-2 overflow-x-auto scroll-smooth px-1 py-2 motion-reduce:scroll-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {days.map(({ date, closed }) => (
              <Button
                key={date} type="button" variant="outline" disabled={closed || confirming}
                aria-pressed={date === selectedDate}
                aria-label={`${formatDate(date, { dateStyle: "full" })}${closed ? ", fechado" : ""}`}
                onClick={() => chooseDate(date)}
                onFocus={(event) => event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })}
                className={`h-auto min-w-16 snap-start flex-col gap-0 rounded-2xl px-3 py-2.5 transition-colors ${date === selectedDate ? "border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground" : "border-border bg-card text-foreground hover:bg-accent"}`}
              >
                <span className={`text-[11px] font-semibold tracking-wider uppercase ${date === selectedDate ? "text-blue-100" : "text-gray-500"}`}>{formatDate(date, { weekday: "short" }).replace(".", "")}</span>
                <span className="my-0.5 text-lg leading-tight font-bold">{formatDate(date, { day: "2-digit" })}</span>
                <span className={`text-[10px] leading-none font-medium uppercase ${date === selectedDate ? "text-blue-100" : "text-gray-400"}`}>{closed ? "Fechado" : formatDate(date, { month: "short" }).replace(".", "")}</span>
              </Button>
            ))}
          </div>
        </section>

        <section aria-labelledby={`${id}-time-heading`}>
          <h2 id={`${id}-time-heading`} className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Clock aria-hidden="true" className="size-4 text-primary" /> Horários Disponíveis
          </h2>
          <div role="group" aria-label="Filtrar por período" className="mb-4 flex flex-wrap gap-2">
            {PERIODS.map((item) => (
              <Badge key={item.id} render={<Button type="button" disabled={confirming} onClick={() => setPeriod(item.id)} aria-pressed={period === item.id} />} className={`h-auto min-h-11 rounded-full px-4 py-2 text-xs transition-colors ${period === item.id ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border-border bg-card text-muted-foreground hover:bg-accent"}`}>
                {item.label}
              </Badge>
            ))}
          </div>
          {loading && <p role="status" className="py-4 text-sm text-muted-foreground">Consultando horários disponíveis…</p>}
          {slotError && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{slotError}</p><Button type="button" variant="outline" onClick={() => void selection.reload()} className="min-h-10 rounded-xl px-3">Tentar novamente</Button></div>}
          <div role="group" aria-labelledby={`${id}-time-heading`} className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {visibleSlots.map(({ time, disabled }) => (
              <Button
                key={time} type="button" variant="outline" disabled={disabled || confirming}
                aria-label={`${time}${disabled ? ", indisponível" : ""}`} aria-pressed={canContinue && selectedTime === time}
                onClick={() => chooseTime(time)}
                className={`h-11 rounded-lg px-3 py-2 text-sm! font-medium! transition-colors ${disabled ? "border-border bg-muted text-muted-foreground line-through" : selectedTime === time ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary hover:bg-accent"}`}
              >
                {time}
                {!disabled && selectedTime === time && <Check aria-hidden="true" className="size-3.5" />}
              </Button>
            ))}
          </div>
          {!loading && !slotError && !visibleSlots.some((slot) => !slot.disabled) && (
            <p role="status" className="mt-4 rounded-2xl bg-card p-4 text-sm text-muted-foreground">Nenhum horário disponível neste período. Escolha outro período ou dia.</p>
          )}
          <p className="mt-4 text-xs text-muted-foreground">{loadAvailability ? "Horários de Brasília. Disponibilidade consultada na agenda da barbearia." : "Horários de Brasília, conforme o expediente. Disponibilidade do profissional sujeita à confirmação."}</p>
        </section>

        {confirmError && <p role="alert" className="mt-4 text-sm text-destructive">{confirmError}</p>}
        {showReview && canContinue && (
          <Card ref={reviewRef} tabIndex={-1} aria-labelledby={`${id}-review-heading`} className="mt-6 rounded-2xl bg-card p-5 shadow-sm outline-none focus:ring-2 focus:ring-primary">
            <CardContent className="space-y-2 p-0">
              <h2 id={`${id}-review-heading`} className="font-semibold">Resumo do agendamento</h2>
              <p className="text-sm">{service.title} · {service.price}</p>
              <p className="text-sm text-muted-foreground">{barberName}</p>
              <p className="text-sm font-semibold text-primary">{summary}</p>
              {onConfirm && (
                <Button type="button" disabled={confirming} onClick={() => void selection.confirm()} className="mt-3 min-h-12 w-full gap-2 rounded-full bg-primary px-6 py-6 font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                  {confirming ? "Confirmando…" : "Confirmar Agendamento"} <Check aria-hidden="true" className="size-4" />
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/90 p-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div role="status" aria-live="polite" aria-atomic="true" className="flex min-w-0 items-center justify-between gap-3 sm:block sm:flex-1">
            <p className="shrink-0 text-[11px] font-medium text-gray-400">Data e Horário</p>
            <p className="min-w-0 text-right text-sm leading-snug font-semibold sm:mt-0.5 sm:text-left">{summary}</p>
          </div>
          <Button type="button" disabled={!canContinue || confirming} onClick={handleReview} className="h-11 w-full gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm! font-semibold! text-primary-foreground shadow-sm shadow-blue-500/20 transition-colors hover:bg-primary/90 sm:w-auto sm:rounded-full">
            Revisar Agendamento <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </footer>
    </div>
  )
}
