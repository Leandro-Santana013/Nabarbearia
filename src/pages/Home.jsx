import { useState } from "react"
import { Search, MapPin, Clock, MessageCircle } from "lucide-react"
import Header from "@/components/Header"
import CategoryFilter from "@/components/CategoryFilter"
import BarberServiceCard from "@/components/BarberServiceCard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api } from "@/services/api"
import { SERVICES, BARBERSHOP_INFO, FULL_ADDRESS, WHATSAPP_URL } from "@/data/barbershopData"

/** @param {import("./Home.types").HomeProps} props */
export default function Home({
  onSelectService, userName = "Cliente", userAvatar,
  services: catalogServices = SERVICES, isAuthenticated = true, onSignIn,
  activeAppointmentCount = 0, notifications, onNotificationDetails,
  onViewAppointments, onEditProfile, onLogout, onNotificationClick,
} = {}) {
  async function logout() {
    if (onLogout) return onLogout()
    const session = await api.authSession()
    if (session) await api.logout()
    window.location.assign("/")
  }

  const [selectedCategory, setSelectedCategory] = useState("Todos")
  const [searchQuery, setSearchQuery] = useState("")

  const services = catalogServices
  const categories = ["Todos", ...new Set(services.map((service) => service.category))]

  // Filtra serviços pela categoria selecionada e texto de busca
  const filteredServices = services.filter((service) => {
    const matchesCategory =
      selectedCategory === "Todos" || service.category === selectedCategory

    const matchesSearch =
      searchQuery.trim() === "" ||
      service.name.toLocaleLowerCase("pt-BR").includes(searchQuery.trim().toLocaleLowerCase("pt-BR")) ||
      service.description.toLocaleLowerCase("pt-BR").includes(searchQuery.trim().toLocaleLowerCase("pt-BR"))

    return matchesCategory && matchesSearch
  })

  const handleBookService = (service) => {
    if (onSelectService) {
      onSelectService(service)
    } else {
      alert(`Iniciando agendamento para: ${service.name}!`)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased flex flex-col">
      {/* Conteúdo Principal (Mobile-First max-w-md no mobile, expansível no desktop) */}
      <main className="w-full max-w-md md:max-w-4xl lg:max-w-5xl mx-auto px-4 md:px-6 pt-4 md:pt-8 pb-12 md:pb-16 flex flex-col gap-4 md:gap-6">

        {/* 2. TopBar / Header do Usuário */}
        <Header
          userName={userName}
          isAuthenticated={isAuthenticated}
          onSignIn={onSignIn}
          userAvatar={userAvatar}
          greeting="Bom dia!"
          notifications={notifications}
          onNotificationDetails={onNotificationDetails}
          activeAppointmentCount={activeAppointmentCount}
          onViewAppointments={onViewAppointments ?? (() => window.location.assign("/meus-agendamentos"))}
          onEditProfile={onEditProfile ?? (() => window.location.assign("/perfil"))}
          onLogout={logout}
          onNotificationClick={onNotificationClick}
        />

        {/* Campo de Busca Rápida */}
        <div className="flex w-full items-center gap-3 rounded-full border border-border bg-white px-4 py-2.5 shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30">
          <Search aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
          <Input
            type="text"
            aria-label="Buscar serviços"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar serviço, corte ou tratamento..."
            className="h-6! min-h-0! min-w-0 flex-1 border-none! bg-transparent! p-0! text-sm! text-foreground outline-none! shadow-none! placeholder:text-muted-foreground/70 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="shrink-0 rounded-full px-1 text-xs font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              Limpar
            </button>
          )}
        </div>

        {/* 4. CategoryFilter (Filtro de Serviços em Pílulas) */}
        <CategoryFilter
          categories={categories}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          onViewAll={() => setSelectedCategory("Todos")}
        />

        {/* 5. Seção de Serviços Populares (Substituindo Barbeiros em Destaque) */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm md:text-base font-bold text-foreground">
              Catálogo de Serviços
            </h3>
            <span
              onClick={() => {
                setSelectedCategory("Todos")
                setSearchQuery("")
              }}
              className="text-xs text-primary font-semibold cursor-pointer hover:underline"
            >
              Ver todos ({services.length})
            </span>
          </div>

          {/* Lista de serviços com títulos completos e itens dos combos */}
          {filteredServices.length > 0 ? (
            <div className="flex w-full flex-col gap-3">
              {filteredServices.map((service) => (
                <BarberServiceCard
                  key={service.id}
                  service={service}
                  onBook={() => handleBookService(service)}
                />
              ))}
            </div>
          ) : (
            <div className="bg-card border border-border/80 rounded-3xl p-8 text-center space-y-3 shadow-xs">
              <div className="w-12 h-12 rounded-full bg-muted mx-auto flex items-center justify-center text-muted-foreground">
                <Search className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-foreground">Nenhum serviço encontrado</p>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                Não encontramos nenhum serviço com os filtros atuais.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory("Todos")
                  setSearchQuery("")
                }}
                className="text-xs text-primary font-bold hover:underline"
              >
                Limpar filtros
              </button>
            </div>
          )}
        </section>

        <footer aria-label="Informações da NA Barbearia" className="mt-14 border-t border-border/60 px-1 pt-10 pb-6 text-muted-foreground sm:mt-16 sm:pt-12">
          <div className="grid gap-8 rounded-[1.75rem] border border-border/70 bg-white/80 p-5 shadow-sm sm:p-7 md:grid-cols-[minmax(0,1fr)_minmax(18rem,0.9fr)] md:items-start md:gap-12">
            <div className="flex flex-col items-center text-center md:items-start md:text-left">
              <div className="flex items-center gap-3">
                <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-[#EAF7FA] p-1 shadow-xs">
                  <img src="/brand/optimized/logo-256.webp" alt="Logo da NA Barbearia" width="256" height="256" loading="lazy" decoding="async" className="size-12 object-contain" />
                </span>
                <div>
                  <p className="text-lg font-bold tracking-tight text-primary">{BARBERSHOP_INFO.name}</p>
                  <p className="mt-1 max-w-xs text-sm leading-relaxed">Estética, cuidado pessoal e bem-estar masculino em Santos.</p>
                </div>
              </div>

              <Button
                variant="outline"
                nativeButton={false}
                render={<a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" />}
                className="mt-6 min-h-11 max-w-full gap-2 rounded-xl border-[#00749C]/25 bg-[#F2FAFC] px-4 py-2.5 text-xs! whitespace-normal text-[#00749C] transition-colors hover:border-[#00749C] hover:bg-[#EAF7FA] hover:text-[#005B78]"
              >
                <MessageCircle aria-hidden="true" className="size-4" />
                Dúvidas? Fale no WhatsApp
                <span className="sr-only">(abre em nova aba)</span>
              </Button>
            </div>

            <div className="grid gap-5 border-t border-border/60 pt-6 text-sm sm:grid-cols-2 sm:gap-6 md:border-t-0 md:border-l md:pl-8 md:pt-0">
              <div className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#EAF7FA] text-[#00749C]">
                  <MapPin aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500">Visite a unidade</p>
                  <p className="mt-1.5 leading-relaxed text-gray-600">{FULL_ADDRESS}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#EAF7FA] text-[#00749C]">
                  <Clock aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500">Horários</p>
                  <div className="mt-1.5 space-y-1 leading-relaxed text-gray-600">{BARBERSHOP_INFO.businessHours.map((hours) => <p key={hours.days}>{hours.days}: {hours.closed ? "Fechado" : `${hours.open} às ${hours.close}`}</p>)}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col items-center gap-2 border-t border-border/60 pt-5 text-center text-xs text-muted-foreground/70 sm:flex-row sm:justify-between sm:text-left">
            <p>© {new Date().getFullYear()} {BARBERSHOP_INFO.name}. Todos os direitos reservados.</p>
            <p>Macuco · Santos/SP</p>
          </div>
        </footer>

      </main>


    </div>
  )
}
