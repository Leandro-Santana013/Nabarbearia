import { useEffect, useId, useRef } from "react"
import { Check, Calendar, Clock, MapPin, MessageSquare, ArrowRight, Home } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { siteConfig } from "@/config/siteConfig"
import { BARBERSHOP_INFO, FULL_ADDRESS, WHATSAPP_URL } from "@/data/barbershopData"

const WHATSAPP_MESSAGES = {
  sent: {
    title: "Lembrete enviado!",
    description: "Enviamos os detalhes e enviaremos um lembrete automático no seu WhatsApp antes do horário.",
  },
  pending: {
    title: "Envio em andamento",
    description: "Os detalhes do agendamento estão aguardando envio pelo WhatsApp.",
  },
  failed: {
    title: "Não foi possível enviar pelo WhatsApp",
    description: "Seu agendamento continua confirmado. Consulte os detalhes em Meus Agendamentos.",
  },
  unavailable: {
    title: "Lembretes pelo WhatsApp",
    description: "O envio de detalhes e lembretes pelo WhatsApp ainda não está disponível.",
  },
}

/** @param {import("./BookingSuccess.types").BookingSuccessProps} props */
export default function BookingSuccess({
  booking, isDemo = true, whatsappStatus = "unavailable",
  onViewAppointments, onGoHome,
} = {}) {
  const id = useId()
  const headingRef = useRef(null)
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  if (!booking) {
    return <main className="mx-auto max-w-lg space-y-4 px-4 py-8 text-center"><h1 className="text-xl font-semibold">Nenhum agendamento confirmado</h1><Button type="button" onClick={onGoHome ?? (() => window.location.assign("/home"))} className="min-h-11 rounded-full px-6">Escolher um serviço</Button></main>
  }

  const { service, barber, date, time } = booking
  const barberName = barber.isAny ? "Qualquer disponível" : barber.name
  const initials = barber.name.split(" ").filter(Boolean).map((part) => part[0]).slice(0, 2).join("")
  const formattedDate = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`))
  // Só um resultado real de envio pode acionar o feedback de WhatsApp enviado.
  const notification = WHATSAPP_MESSAGES[isDemo ? "unavailable" : whatsappStatus] ?? WHATSAPP_MESSAGES.unavailable
  const wasSent = !isDemo && whatsappStatus === "sent"
  const address = siteConfig.address
  const whatsappSummary = `Olá! Gostaria de confirmar este agendamento na ${BARBERSHOP_INFO.name}:\nServiço: ${service.title}\nValor: ${service.price}\nDuração: ${service.duration}\nProfissional: ${barberName}\nData: ${formattedDate} às ${time} (Brasília)\nLocal: ${FULL_ADDRESS}`

  return (
    <div className="min-h-dvh bg-background font-sans text-foreground antialiased">
      <main className="mx-auto max-w-lg px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] text-center">
        <div aria-hidden="true" className="mx-auto mb-4 flex size-20 items-center justify-center rounded-full bg-accent text-primary">
          <Check className="size-10" strokeWidth={2.5} />
        </div>
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold tracking-tight outline-none">
          Agendamento Confirmado!
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {isDemo ? "Confira a demonstração do seu agendamento na Na Barbearia." : "Seu horário foi reservado com sucesso na Na Barbearia."}
        </p>

        <Alert role="status" aria-live="polite" className={`my-6 gap-x-3 rounded-2xl p-4 text-left ${wasSent ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-primary/20 bg-accent text-accent-foreground"}`}>
          <MessageSquare aria-hidden="true" className="size-5" />
          <AlertTitle className="font-semibold">{notification.title}</AlertTitle>
          <AlertDescription className={`leading-relaxed ${wasSent ? "text-emerald-900" : "text-accent-foreground"}`}>
            {notification.description}
          </AlertDescription>
        </Alert>

        <Card aria-labelledby={`${id}-receipt`} className="mb-8 rounded-3xl border border-border bg-card p-6 text-left shadow-sm ring-0">
          <CardContent className="space-y-5 p-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id={`${id}-receipt`}>
                <Badge className="h-auto rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">Comprovante</Badge>
              </h2>
              {isDemo && <Badge variant="outline" className="h-auto rounded-full px-3 py-1 text-muted-foreground">Demonstração</Badge>}
            </div>
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1 basis-44">
                <p className="mb-1 text-xs text-muted-foreground">Serviço</p>
                <h3 className="break-words text-base font-semibold">{service.title}</h3>
              </div>
              <p className="text-lg font-bold text-primary">{service.price}</p>
            </div>
            <div className="flex items-center gap-3 border-t border-border pt-5">
              <Avatar className="size-11 shrink-0">
                {barber.avatar && <AvatarImage src={barber.avatar} alt="" />}
                <AvatarFallback className="bg-accent font-semibold text-accent-foreground">{barber.isAny ? "NA" : initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Profissional</p>
                <p className="break-words text-sm font-semibold">{barberName}</p>
              </div>
            </div>
            <dl className="space-y-4 border-t border-border pt-5 text-sm">
              <div className="flex items-start gap-3">
                <Calendar aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                <div>
                  <dt className="text-xs text-muted-foreground">Data e horário</dt>
                  <dd className="mt-1 font-medium first-letter:uppercase"><time dateTime={`${date}T${time}`}>{formattedDate} às {time}</time></dd>
                  <dd className="mt-1 text-xs text-muted-foreground">Horário de Brasília</dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                <div><dt className="text-xs text-muted-foreground">Duração estimada</dt><dd className="mt-1 font-medium">{service.duration}</dd></div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Localização</dt>
                  <dd className="mt-1 break-words leading-relaxed">{address.street} - {address.neighborhood}, {address.city} - {address.state}</dd>
                </div>
              </div>
            </dl>
          </CardContent>
        </Card>

        <nav aria-label="Ações do agendamento" className="flex flex-col gap-3">
          <Button variant="outline" nativeButton={false} render={<a href={`${WHATSAPP_URL}?text=${encodeURIComponent(whatsappSummary)}`} target="_blank" rel="noopener noreferrer" />} className="min-h-12 gap-2 rounded-full border-primary/20 px-5 py-3 whitespace-normal text-primary transition-colors hover:bg-accent">
            <MessageSquare aria-hidden="true" className="size-4" /> Confirmar disponibilidade no WhatsApp
            <span className="sr-only"> (abre em nova aba)</span>
          </Button>
          <Button type="button" onClick={onViewAppointments ?? (() => window.location.assign("/meus-agendamentos"))} className="min-h-12 gap-2 rounded-full bg-primary px-6 py-6 font-semibold text-primary-foreground shadow-lg shadow-blue-500/20 transition-colors hover:bg-primary/90">
            Ver Meus Agendamentos <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
          <Button type="button" variant="ghost" onClick={onGoHome ?? (() => window.location.assign("/home"))} className="min-h-12 gap-2 rounded-full px-6 py-6 text-muted-foreground transition-colors">
            <Home aria-hidden="true" className="size-4" /> Voltar ao Início
          </Button>
        </nav>
      </main>
    </div>
  )
}
