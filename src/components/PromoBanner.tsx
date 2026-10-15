import React from "react"
import { Scissors, Sparkles, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface PromoBannerProps {
  title?: string
  subtitle?: string
  ctaText?: string
  discountBadge?: string
  imageSrc?: string
  onCtaClick?: () => void
}

/**
 * PromoBanner - Banner de Destaque
 *
 * Card moderno de alto contraste com fundo escuro (#1A1A1E),
 * tipografia expressiva, botão em Azul Primário (#0099FF)
 * e área visual com suporte a imagem de barbeiro em ação.
 */
export default function PromoBanner({
  title = "Agende seu horário na melhor barbearia de Santos",
  subtitle = "Profissionais experientes, ambiente climatizado e atendimento com hora marcada.",
  ctaText = "Agendar Agora",
  discountBadge = "20% OFF no primeiro corte",
  imageSrc,
  onCtaClick,
}: PromoBannerProps) {
  return (
    <div className="w-full rounded-3xl bg-[#1A1A1E] text-white p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden shadow-xl border border-white/5 relative">
      {/* Elemento de iluminação difusa decorativo */}
      <div className="absolute -left-12 -top-12 w-48 h-48 rounded-full bg-[#0099FF]/20 blur-3xl pointer-events-none" />
      <div className="absolute -right-10 -bottom-10 w-44 h-44 rounded-full bg-[#0099FF]/15 blur-2xl pointer-events-none" />

      {/* Lado Esquerdo / Topo: Conteúdo Textual e CTA */}
      <div className="space-y-4 max-w-lg z-10 flex flex-col items-start w-full md:w-auto">
        {discountBadge && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0099FF]/20 border border-[#0099FF]/40 text-[#0099FF] text-xs font-extrabold tracking-wide">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{discountBadge}</span>
          </div>
        )}

        <div className="space-y-2">
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight text-white">
            {title}
          </h2>
          <p className="text-sm text-gray-300 leading-relaxed max-w-md">
            {subtitle}
          </p>
        </div>

        <div className="pt-2">
          <Button
            onClick={onCtaClick}
            className="rounded-full bg-[#0099FF] hover:bg-[#0088EE] text-white font-extrabold text-sm px-6 py-2.5 h-auto shadow-md transition-all active:scale-95 flex items-center gap-2"
          >
            <span>{ctaText}</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Lado Direito / Fundo: Espaço Reservado para Imagem do Barbeiro em Ação */}
      <div className="w-full md:w-72 h-44 md:h-52 shrink-0 rounded-2xl overflow-hidden bg-gradient-to-tr from-neutral-800 to-neutral-700/80 border border-white/10 relative shadow-inner z-10 flex items-center justify-center">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt="Barbeiro em ação"
            className="w-full h-full object-cover object-center"
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 text-center p-4">
            <div className="w-12 h-12 rounded-full bg-[#0099FF]/20 text-[#0099FF] flex items-center justify-center">
              <Scissors className="w-6 h-6" />
            </div>
            <span className="text-xs font-bold text-gray-200">NA Barbearia Premium</span>
            <span className="text-[11px] text-gray-400">Corte &amp; Barba Tradicional</span>
          </div>
        )}
      </div>
    </div>
  )
}
