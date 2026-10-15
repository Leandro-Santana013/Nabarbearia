import React, { useState } from "react"
import { SERVICE_CATEGORIES } from "@/data/barbershopData"
import { Button } from "@/components/ui/button"

export interface CategoryFilterProps {
  categories?: string[]
  selectedCategory?: string
  onSelectCategory?: (category: string) => void
  showTitle?: boolean
  onViewAll?: () => void
}

/**
 * CategoryFilter - Filtro de Serviços em Pílulas
 *
 * Permite navegação rápida em scroll horizontal.
 * A pílula ativa ganha destaque em Azul Vibrante (#0099FF).
 */
export default function CategoryFilter({
  categories = SERVICE_CATEGORIES,
  selectedCategory: controlledSelected,
  onSelectCategory,
  showTitle = true,
  onViewAll,
}: CategoryFilterProps) {
  const [internalSelected, setInternalSelected] = useState(categories[0] || "Todos")

  const currentSelected = controlledSelected !== undefined ? controlledSelected : internalSelected

  const handleSelect = (category: string) => {
    setInternalSelected(category)
    if (onSelectCategory) {
      onSelectCategory(category)
    }
  }

  return (
    <div className="w-full space-y-2">
      {showTitle && (
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm md:text-base font-bold text-foreground">
            Categorias de Serviços
          </h3>
          {onViewAll && (
            <button
              type="button"
              onClick={onViewAll}
              className="text-xs text-[#0099FF] hover:underline font-semibold cursor-pointer"
            >
              Ver todas
            </button>
          )}
        </div>
      )}

      {/* Scroll horizontal suave sem scrollbar intrusiva */}
      <div role="group" aria-label="Filtrar serviços por categoria" className="flex items-center gap-2 overflow-x-auto px-1 py-1.5 scroll-smooth motion-reduce:scroll-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {categories.map((category) => {
          const isActive = currentSelected === category
          return (
            <Button
              key={category}
              type="button"
              variant="outline"
              aria-pressed={isActive}
              onClick={() => handleSelect(category)}
              className={`h-auto min-h-8 shrink-0 cursor-pointer rounded-full px-3.5 py-1.5 text-xs! whitespace-nowrap shadow-sm transition-colors ${
                isActive
                  ? "border-transparent bg-[#0099FF] font-semibold! text-white shadow-blue-500/20 hover:bg-[#0088EE] hover:text-white"
                  : "border-border/80 bg-white font-medium! text-muted-foreground hover:bg-slate-50 hover:text-foreground"
              }`}
            >
              {category}
            </Button>
          )
        })}
      </div>
    </div>
  )
}
