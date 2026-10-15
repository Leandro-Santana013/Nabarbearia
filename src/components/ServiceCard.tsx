import React from "react"
import { Clock, Plus, Scissors, Sparkles } from "lucide-react"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export interface ServiceCardProps {
  title: string
  duration: string
  description: string
  price: string | number
  badge?: string
  image?: string
  icon?: React.ComponentType<{ className?: string }>
  onBook?: () => void
}

/**
 * ServiceCard - Card de Apresentação de Serviço
 *
 * Exibe imagem/ilustração representativa, título do serviço,
 * duração estimada, descrição rápida, preço formatado e botão
 * de agendamento em Azul Primário (#0099FF).
 */
export default function ServiceCard({
  title,
  duration,
  description,
  price,
  badge,
  image,
  icon: Icon = Scissors,
  onBook,
}: ServiceCardProps) {
  const formattedPrice = typeof price === "number"
    ? `R$ ${price.toFixed(2).replace(".", ",")}`
    : price.startsWith("R$") ? price : `R$ ${price}`

  return (
    <Card className="rounded-3xl border-border/80 bg-card p-3.5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group">
      {/* Topo: Imagem ou Ilustração com Badge */}
      <div className="relative w-full h-32 rounded-2xl overflow-hidden bg-gradient-to-br from-[#0099FF]/15 via-accent/30 to-muted border border-border/40 flex items-center justify-center">
        {image ? (
          <img
            src={image}
            alt={title}
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-12 h-12 rounded-2xl bg-white/80 dark:bg-black/60 shadow-xs flex items-center justify-center text-[#0099FF] group-hover:scale-110 transition-transform duration-300">
            <Icon className="w-6 h-6" />
          </div>
        )}

        {/* Badge de Destaque / Duração no Topo */}
        <div className="absolute top-2 right-2 flex items-center gap-1">
          {badge && (
            <Badge className="rounded-full px-2 py-0.5 text-[10px] font-extrabold bg-[#0099FF] text-white border-0 shadow-xs">
              {badge}
            </Badge>
          )}
          <Badge
            variant="secondary"
            className="rounded-full px-2 py-0.5 text-[10px] font-bold bg-white/90 dark:bg-black/80 backdrop-blur text-foreground shadow-xs flex items-center gap-1 border-0"
          >
            <Clock className="w-3 h-3 text-[#0099FF]" />
            <span>{duration}</span>
          </Badge>
        </div>
      </div>

      {/* Meio: Título e Descrição */}
      <CardContent className="px-1 pt-3 pb-2 space-y-1.5 flex-1 flex flex-col">
        <h4 className="font-extrabold text-sm md:text-base text-foreground tracking-tight leading-snug group-hover:text-[#0099FF] transition-colors line-clamp-1">
          {title}
        </h4>
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {description}
        </p>
      </CardContent>

      {/* Rodapé: Preço e Botão de Agendamento */}
      <CardFooter className="px-1 pt-2 pb-0.5 flex items-center justify-between gap-2 border-t border-border/40 mt-auto">
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">
            Valor
          </span>
          <span className="text-base font-black text-[#0099FF] leading-none">
            {formattedPrice}
          </span>
        </div>

        <Button
          size="sm"
          onClick={onBook}
          aria-label={`Agendar ${title}`}
          className="rounded-full px-3.5 py-1.5 h-8 bg-[#0099FF] hover:bg-[#0088EE] text-white text-xs font-bold shadow-xs active:scale-95 transition-all flex items-center gap-1.5"
        >
          <span>Agendar</span>
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </CardFooter>
    </Card>
  )
}
