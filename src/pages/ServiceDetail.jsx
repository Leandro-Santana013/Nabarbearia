import { useId, useState } from "react"
import { ArrowLeft, Clock, ThumbsUp, Zap, ArrowRight, Check } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

import { DEFAULT_SERVICE, BOOKING_BARBERS } from "@/data/bookingCatalog"

const ANY_BARBER = {
  id: "any",
  name: "Qualquer Profissional Disponível",
  specialty: "Ideal para encontrar o horário livre mais próximo",
  rating: "",
  reviewCount: 0,
  isAny: true,
}

/** @param {import("./ServiceDetail.types").ServiceDetailProps} props */
export default function ServiceDetail({
  service = DEFAULT_SERVICE,
  barbers = BOOKING_BARBERS,
  initialBarberId = "any",
  onBack,
  onSelectSchedule,
} = {}) {
  const [selectedBarber, setSelectedBarber] = useState(initialBarberId)
  const id = useId()
  const chosenBarber = barbers.find((barber) => barber.id === selectedBarber) ?? ANY_BARBER
  const selectedName = chosenBarber.isAny ? "Qualquer disponível" : chosenBarber.name
  const options = [ANY_BARBER, ...barbers]

  function handleContinue() {
    if (onSelectSchedule) {
      onSelectSchedule(chosenBarber, service)
      return
    }
    // Demonstração independente; a próxima etapa é conectada pelo callback acima.
    window.alert(`Profissional selecionado: ${selectedName}. Serviço: ${service.title}.`)
  }

  return (
    <div className="min-h-dvh bg-[#F4F4F6] font-sans text-[#111111] antialiased">
      <main className="mx-auto max-w-2xl px-4 py-6 pb-[calc(10rem+env(safe-area-inset-bottom))]">
        <header className="mb-6 grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Voltar para os serviços"
            onClick={onBack ?? (() => window.history.back())}
            className="size-11 rounded-full transition-colors hover:bg-white"
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
          </Button>
          <h1 className="text-center text-base font-semibold sm:text-lg">
            Selecionar Profissional
          </h1>
          <span aria-hidden="true" />
        </header>

        <Card className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-0">
          <CardContent className="space-y-3 p-0">
            <Badge className="h-auto max-w-full whitespace-normal rounded-full border-0 bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
              {service.category}
            </Badge>
            <h2 className="break-words text-xl font-bold tracking-tight sm:text-2xl">
              {service.title}
            </h2>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock aria-hidden="true" className="size-4" />
                <span><span className="sr-only">Duração: </span>{service.duration}</span>
              </span>
              <span className="text-lg font-bold text-[#0099FF]">
                <span className="sr-only">Valor: </span>{service.price}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {service.description}
            </p>
          </CardContent>
        </Card>

        <section aria-labelledby={`${id}-heading`}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 id={`${id}-heading`} className="text-sm font-semibold">
              Escolha o Barbeiro
            </h2>
            <p className="text-xs text-muted-foreground">
              {barbers.length} {barbers.length === 1 ? "profissional disponível" : "profissionais disponíveis"}
            </p>
          </div>

          <RadioGroup
            name={`${id}-barber`}
            value={chosenBarber.id}
            onValueChange={setSelectedBarber}
            aria-labelledby={`${id}-heading`}
            className="gap-2.5"
          >
            {options.map((barber) => {
              const isSelected = chosenBarber.id === barber.id
              const optionId = `${id}-${barber.id}`
              const initials = barber.name.split(" ").filter(Boolean).map((part) => part[0]).slice(0, 2).join("")

              return (
                <Card
                  key={barber.id}
                  className={`relative rounded-2xl border-2 p-0 shadow-sm ring-0 focus-within:ring-2 focus-within:ring-[#0099FF] focus-within:ring-offset-2 ${
                    isSelected
                      ? "border-[#0099FF] bg-blue-50/30"
                      : "border-gray-100 bg-white hover:border-blue-200"
                  }`}
                >
                  <CardContent className="flex items-center gap-3 p-3">
                    {barber.isAny ? (
                      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-[#0099FF]">
                        <Zap aria-hidden="true" className="size-5" />
                      </span>
                    ) : (
                      <Avatar className="size-12 shrink-0 border border-gray-200">
                        {barber.avatar && <AvatarImage src={barber.avatar} alt="" loading="lazy" />}
                        <AvatarFallback className="bg-accent font-semibold text-accent-foreground">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div className="min-w-0 flex-1">
                      <label
                        id={`${optionId}-label`}
                        htmlFor={optionId}
                        className="block cursor-pointer break-words text-sm leading-tight font-semibold text-gray-900 after:absolute after:inset-0 after:rounded-2xl"
                      >
                        {barber.name}
                      </label>
                      <p id={`${optionId}-description`} className="mt-0.5 break-words text-xs leading-snug text-gray-500">
                        {barber.specialty}
                      </p>
                      {!barber.isAny && (
                        <p id={`${optionId}-rating`} className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] leading-snug font-medium text-amber-600">
                          <ThumbsUp aria-hidden="true" className="size-3 shrink-0" />
                          <span>{barber.likes ?? 0} {barber.likes === 1 ? "recomendação" : "recomendações"}</span>
                        </p>
                      )}
                    </div>
                    <RadioGroupItem
                      id={optionId}
                      value={barber.id}
                      aria-labelledby={`${optionId}-label`}
                      aria-describedby={`${optionId}-description${barber.isAny ? "" : ` ${optionId}-rating`}`}
                      className="relative z-10 size-6 items-center justify-center border-slate-300 data-checked:border-[#0099FF] data-checked:bg-[#0099FF]"
                    />
                  </CardContent>
                </Card>
              )
            })}
          </RadioGroup>
        </section>
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-white/80 px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1 basis-32" role="status" aria-live="polite" aria-atomic="true">
            <p className="text-xs text-muted-foreground">Profissional selecionado</p>
            <p className="mt-1 flex items-start gap-1.5 text-sm font-semibold">
              <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[#0099FF]" />
              <span className="break-words">{selectedName}</span>
            </p>
          </div>
          <Button
            type="button"
            onClick={handleContinue}
            className="h-12 gap-2 rounded-full bg-[#0099FF] px-6 py-6 font-semibold text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-[#0088EE]"
          >
            Escolher Horário
            <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </footer>
    </div>
  )
}
