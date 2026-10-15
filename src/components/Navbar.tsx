import React from "react"
import { Home, Search, Calendar, User, Scissors } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface NavbarProps {
  activeTab?: "home" | "search" | "appointments" | "profile"
  onTabChange?: (tab: "home" | "search" | "appointments" | "profile") => void
  onBookClick?: () => void
}

/**
 * Navbar - Navegação Responsiva
 *
 * - Mobile (< md): Barra flutuante escura no rodapé (fixed bottom-4) com cantos arredondados (rounded-full).
 * - Desktop (>= md): Header superior fixo/sticky com navegação completa e botão de ação.
 */
export default function Navbar({
  activeTab = "home",
  onTabChange,
  onBookClick,
}: NavbarProps) {
  const navItems = [
    { id: "home" as const, label: "Início", icon: Home },
    { id: "search" as const, label: "Buscar", icon: Search },
    { id: "appointments" as const, label: "Agendamentos", icon: Calendar },
    { id: "profile" as const, label: "Perfil", icon: User },
  ]

  const handleTabClick = (tabId: "home" | "search" | "appointments" | "profile") => {
    if (onTabChange) {
      onTabChange(tabId)
    }
  }

  return (
    <>
      {/* ========================================================
          1. HEADER DESKTOP (>= md): Barra superior com links
          ======================================================== */}
      <header className="hidden md:flex sticky top-0 z-40 w-full border-b border-border/80 bg-background/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto w-full px-6 h-16 flex items-center justify-between">
          {/* Logo / Marca */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => handleTabClick("home")}>
            <div className="w-9 h-9 rounded-xl bg-[#0099FF] flex items-center justify-center text-white shadow-sm">
              <Scissors className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-black tracking-tight text-foreground leading-none">NA Barbearia</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Santos / SP</span>
            </div>
          </div>

          {/* Links Centrais */}
          <nav className="flex items-center gap-1 bg-muted/50 p-1 rounded-full border border-border/60">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = activeTab === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleTabClick(item.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all ${
                    isActive
                      ? "bg-[#0099FF] text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </nav>

          {/* Ação Direita */}
          <div className="flex items-center gap-3">
            <Button
              onClick={onBookClick}
              className="rounded-full bg-[#0099FF] hover:bg-[#0088EE] text-white font-bold text-xs px-5 shadow-sm"
            >
              Agendar Horário
            </Button>
          </div>
        </div>
      </header>

      {/* =========================================================================
          2. BOTTOM NAVIGATION MOBILE (< md): Barra flutuante arredondada no rodapé
          ========================================================================= */}
      <aside className="md:hidden fixed bottom-4 left-0 right-0 z-50 pointer-events-none px-4">
        <nav
          aria-label="Navegação Principal"
          className="max-w-md mx-auto pointer-events-auto bg-[#121214] text-white rounded-full p-2 shadow-2xl border border-white/10 flex items-center justify-around"
        >
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id

            if (isActive) {
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleTabClick(item.id)}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#0099FF] text-white font-bold text-xs shadow-sm transition-transform active:scale-95"
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              )
            }

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleTabClick(item.id)}
                aria-label={item.label}
                className="p-2.5 rounded-full text-gray-400 hover:text-white transition-colors flex items-center justify-center active:scale-90"
              >
                <Icon className="w-5 h-5" />
              </button>
            )
          })}
        </nav>
      </aside>
    </>
  )
}
