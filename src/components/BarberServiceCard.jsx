import { Clock, Plus } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

/** @param {{ service: import("@/data/barbershopData").CatalogService, onBook?: () => void }} props */
export default function BarberServiceCard({ service, onBook }) {
  const price = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(service.price)
  const comboItems = service.category === "Combos"
    ? [
        { name: "Cabelo", included: service.name.includes("Corte") },
        { name: "Barba", included: service.name.includes("Barba") },
        { name: "Sobrancelha", included: service.name.includes("Sobrancelha") },
        { name: "Cera", included: service.name.includes("Depilação") },
      ].filter((item) => item.included)
    : []

  return (
    <Card className="w-full min-w-0 gap-2 rounded-2xl border border-border/60 bg-white p-3.5 shadow-sm ring-0">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 break-words text-[15px] leading-snug font-semibold text-foreground">
          {service.name}
        </h3>
        <Badge variant="secondary" className="h-auto shrink-0 gap-1 rounded-full border-0 bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
          <Clock aria-hidden="true" className="size-3" />
          <span className="sr-only">Duração: </span>{service.durationMinutes}m
        </Badge>
      </div>

      {comboItems.length > 0 && (
        <ul aria-label="Itens incluídos no combo" className="flex flex-wrap gap-1">
          {comboItems.map((item) => (
            <li key={item.name}>
              <Badge className="h-auto rounded-md border-0 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                {item.name}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      <p title={service.description} className="line-clamp-2 text-xs leading-relaxed text-gray-500">
        {service.description}
      </p>

      <div className="mt-0.5 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
        <span className="whitespace-nowrap text-base font-bold text-primary">{price}</span>
        <Button type="button" onClick={onBook} aria-label={`Selecionar ${service.name}`} className="h-auto min-h-8 gap-1 rounded-lg bg-primary px-3.5 py-1.5 text-xs! font-semibold! text-primary-foreground transition-colors hover:bg-primary/90">
          <Plus aria-hidden="true" className="size-3.5" /> Selecionar
        </Button>
      </div>
    </Card>
  )
}
