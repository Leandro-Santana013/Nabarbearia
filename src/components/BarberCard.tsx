import React from "react"
import { Star, Plus, Scissors } from "lucide-react"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export interface BarberCardProps {
  name: string
  rating: string | number
  price: string | number
  image?: string
  specialty: string
  onBook?: () => void
}

/**
 * BarberCard - Card de Apresentação do Barbeiro
 *
 * Construído utilizando os componentes estruturais do shadcn/ui (Card, CardContent, CardFooter),
 * exibindo foto com badge de avaliação, especialidade, preço formatado e botão de ação rápido.
 */
export default function BarberCard({
  name,
  rating,
  price,
  image,
  specialty,
  onBook,
}: BarberCardProps) {
  // Formata o preço caso venha como número
  const formattedPrice = typeof price === "number"
    ? `R$ ${price.toFixed(2).replace(".", ",")}`
    : price.startsWith("R$") ? price : `R$ ${price}`

  return (
    <Card className="rounded-3xl border-border/80 bg-card p-3 shadow-xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group">
      {/* Topo: Imagem ou Placeholder Ilustrativo com Badge de Nota */}
      <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-gradient-to-br from-[#0099FF]/15 to-muted border border-border/40 flex items-center justify-center">
        {image ? (
          <img
            src={image}
            alt={name}
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-primary/70">
            <Scissors className="w-10 h-10 opacity-60 group-hover:rotate-12 transition-transform duration-300" />
          </div>
        )}

        {/* Badge de Avaliação */}
        <div className="absolute top-2 right-2">
          <Badge
            variant="secondary"
            className="rounded-full px-2 py-0.5 text-[11px] font-bold bg-white/90 dark:bg-black/80 backdrop-blur text-foreground shadow-xs flex items-center gap-1 border-0"
          >
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            <span>{rating}</span>
          </Badge>
        </div>
      </div>

      {/* Meio: Identificação e Especialidade */}
      <CardContent className="px-1 pt-3 pb-2 space-y-1">
        <h4 className="font-bold text-sm text-foreground tracking-tight truncate group-hover:text-[#0099FF] transition-colors">
          {name}
        </h4>
        <p className="text-xs text-muted-foreground truncate font-medium">
          {specialty}
        </p>
      </CardContent>

      {/* Rodapé: Preço e Botão de Agendamento */}
      <CardFooter className="px-1 pt-1 pb-1 flex items-center justify-between gap-2 border-t border-border/40">
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">
            A partir de
          </span>
          <span className="text-sm font-extrabold text-[#0099FF] leading-none">
            {formattedPrice}
          </span>
        </div>

        <Button
          size="sm"
          onClick={onBook}
          aria-label={`Agendar com ${name}`}
          className="rounded-full w-8 h-8 p-0 bg-[#0099FF] hover:bg-[#0088EE] text-white shadow-xs active:scale-95 transition-all flex items-center justify-center"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </CardFooter>
    </Card>
  )
}
