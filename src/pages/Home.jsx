import { useState } from "react"
import { Search, Scissors, MapPin, Clock, MessageCircle } from "lucide-react"
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
    <div className="min-h-screen bg-[#F4F4F6] text-[#111111] font-sans antialiased flex flex-col">
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
              className="text-xs text-[#0099FF] font-semibold cursor-pointer hover:underline"
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
                className="text-xs text-[#0099FF] font-bold hover:underline"
              >
                Limpar filtros
              </button>
            </div>
          )}
        </section>

        <footer aria-label="Informações da Na Barbearia" className="mt-12 space-y-4 border-t border-border/60 px-4 pt-8 pb-6 text-center text-muted-foreground">
          <div className="space-y-2">
            <p className="flex items-center justify-center gap-2 text-lg font-bold text-[#111111]">
              <Scissors aria-hidden="true" className="size-5 text-primary" />
              {BARBERSHOP_INFO.name}
            </p>
            <p className="text-sm leading-relaxed">Estética, cuidado pessoal e bem-estar masculino em Santos.</p>
          </div>

          <div className="space-y-3 text-sm">
            <p className="flex items-start justify-center gap-2">
              <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{FULL_ADDRESS}</span>
            </p>
            <p className="flex items-start justify-center gap-2">
              <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              <span className="space-y-1 text-left">{BARBERSHOP_INFO.businessHours.map((hours) => <span key={hours.days} className="block">{hours.days}: {hours.closed ? "Fechado" : `${hours.open} às ${hours.close}`}</span>)}</span>
            </p>
          </div>

          <Button
            variant="outline"
            nativeButton={false}
            render={<a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" />}
            className="min-h-11 max-w-full gap-2 rounded-full border-border/80 bg-transparent px-4 py-2.5 text-xs! whitespace-normal text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <MessageCircle aria-hidden="true" className="size-4" />
            Dúvidas? Fale no WhatsApp
            <span className="sr-only">(abre em nova aba)</span>
          </Button>

          <p className="mt-6 text-xs leading-relaxed text-muted-foreground/60">
            © {new Date().getFullYear()} {BARBERSHOP_INFO.name}. Todos os direitos reservados.
          </p>
        </footer>

      </main>


    </div>
  )
}
