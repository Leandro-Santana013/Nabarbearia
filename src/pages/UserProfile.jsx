import { useEffect, useId, useRef, useState } from "react"
import { ArrowLeft, User, Calendar, Star, MessageSquare, MapPin, HelpCircle, ChevronRight, LogOut } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Switch } from "@/components/ui/switch"
import AccountDetailsForm from "@/components/AccountDetailsForm"
import { siteConfig } from "@/config/siteConfig"
import { api } from "@/services/api"

/** @type {import("./UserProfile.types").ClientProfile} */
export const DEFAULT_PROFILE = {
  name: "Cliente", phone: "", completedCuts: 0,
  activeAppointments: 0, favoriteBarber: "", remindersEnabled: false,
}

/** @param {import("./UserProfile.types").UserProfileProps} props */
export default function UserProfile({
  profile = DEFAULT_PROFILE, isDemo = true, onBack, onViewAppointments, onSaveProfile, onSaveAccount, onLogout, accountEditable = true, remindersAvailable = true,
} = {}) {
  const [user, setUser] = useState(profile)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [feedback, setFeedback] = useState("")
  const [error, setError] = useState("")
  const editButtonRef = useRef(null)
  useEffect(() => { setUser(profile) }, [profile.name, profile.email, profile.phone, profile.completedCuts, profile.activeAppointments, profile.favoriteBarber])
  const id = useId()
  const initials = user.name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "NA"
  const viewAppointments = onViewAppointments ?? (() => window.location.assign("/meus-agendamentos"))
  const actionClass = "h-auto min-h-16 w-full justify-start gap-3 rounded-2xl px-3 py-4 text-left text-sm! whitespace-normal transition-colors hover:bg-accent"

  async function saveProfile(next) {
    setSaving(true)
    setError("")
    setFeedback("")
    try {
      await onSaveProfile?.(next)
      setUser(next)
      setFeedback(isDemo ? "Preferências atualizadas nesta sessão." : "Preferências atualizadas.")
      return true
    } catch {
      setError("Não foi possível salvar as alterações. Tente novamente.")
      return false
    } finally {
      setSaving(false)
    }
  }

  function closeEditor() {
    setEditing(false)
    requestAnimationFrame(() => editButtonRef.current?.focus())
  }

  async function handleLogout() {
    if (loggingOut || saving) return
    setLoggingOut(true)
    setError("")
    try {
      if (onLogout) await onLogout()
      else {
        const session = await api.authSession()
        if (session) await api.logout()
        window.location.assign("/")
      }
    } catch {
      setError("Não foi possível sair da conta. Tente novamente.")
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className="min-h-dvh bg-[#F4F4F6] font-sans text-[#111111] antialiased">
      <main className="mx-auto mb-16 max-w-xl px-4 py-6">
        <header className="mb-6 grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2">
          <Button type="button" variant="ghost" size="icon" onClick={onBack ?? (() => window.history.back())} aria-label="Voltar ao início" className="size-11 rounded-full transition-colors">
            <ArrowLeft aria-hidden="true" className="size-5" />
          </Button>
          <h1 className="text-center text-base font-semibold">Meu Perfil</h1>
          <span aria-hidden="true" />
        </header>

        <Card className="relative overflow-hidden rounded-3xl bg-white p-6 text-center shadow-sm">
          <CardContent className="p-0">
            <Avatar className="mx-auto size-20 border-2 border-primary">
              {user.avatar && <AvatarImage src={user.avatar} alt="" />}
              <AvatarFallback className="bg-blue-50 text-xl font-bold text-primary">{initials}</AvatarFallback>
            </Avatar>
            <h2 className="mt-3 break-words text-xl font-bold">{user.name}</h2>
            <p className="mt-2 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <MessageSquare aria-hidden="true" className="size-4 shrink-0" /> {user.phone || "Telefone não informado"}
            </p>
            {user.email && <p className="mt-2 break-words text-xs text-muted-foreground">{user.email}</p>}
            <Badge className="mt-4 h-auto rounded-full border-0 bg-accent px-3 py-1 text-xs text-accent-foreground">
              {user.completedCuts} {user.completedCuts === 1 ? "Corte Realizado" : "Cortes Realizados"}
            </Badge>
          </CardContent>
        </Card>

        <section aria-label="Resumo de atividades" className="my-6 grid grid-cols-2 gap-3">
          <Card className="rounded-2xl bg-white p-0 shadow-sm">
            <Button type="button" variant="ghost" onClick={viewAppointments} className="h-full min-h-32 flex-col items-start gap-2 rounded-2xl p-4 text-left whitespace-normal transition-colors hover:bg-accent">
              <Calendar aria-hidden="true" className="size-5 text-primary" />
              <span className="text-sm font-semibold!">Agendamentos</span>
              <span className="text-xs! font-normal! leading-relaxed text-muted-foreground">{user.activeAppointments} {user.activeAppointments === 1 ? "Ativo" : "Ativos"} • Ver Histórico</span>
            </Button>
          </Card>
          <Card className="gap-2 rounded-2xl bg-white p-4 shadow-sm">
            <Star aria-hidden="true" className="size-5 fill-amber-400 text-amber-400" />
            <h2 className="text-sm font-semibold">Barbeiro Favorito</h2>
            <p className="break-words text-xs leading-relaxed text-muted-foreground">{user.favoriteBarber || "Ainda não escolhido"}</p>
          </Card>
        </section>

        <Card aria-label="Configurações da conta" className="gap-1 rounded-3xl bg-white p-2 shadow-sm">
          <Button ref={editButtonRef} type="button" variant="ghost" aria-expanded={editing} aria-controls={`${id}-editor`} disabled={saving || loggingOut || !accountEditable} onClick={() => {
            setEditing(true)
            setFeedback("")
          }} className={actionClass}>
            <User aria-hidden="true" className="size-5 text-primary" />
            <span className="min-w-0 flex-1">Informações da Conta</span>
            <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
          </Button>
          <div className="flex min-h-16 items-center gap-3 rounded-2xl px-3 py-4">
            <MessageSquare aria-hidden="true" className="size-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <label htmlFor={`${id}-reminders`} className="cursor-pointer text-sm font-medium">Lembretes Automáticos</label>
              <p id={`${id}-reminders-description`} className="mt-1 text-xs leading-relaxed text-muted-foreground">{!remindersAvailable ? "Indisponível no momento" : isDemo ? "Preferência local de WhatsApp" : "Notificações por WhatsApp"}</p>
            </div>
            <Switch id={`${id}-reminders`} name="whatsappReminders" checked={user.remindersEnabled} disabled={saving || loggingOut || !remindersAvailable} aria-describedby={`${id}-reminders-description`} onCheckedChange={(checked) => { void saveProfile({ ...user, remindersEnabled: checked }) }} />
          </div>
          <Button variant="ghost" nativeButton={false} render={<a href={siteConfig.address.mapsUrl} target="_blank" rel="noopener noreferrer" />} className={actionClass}>
            <MapPin aria-hidden="true" className="size-5 text-primary" />
            <span className="min-w-0 flex-1">{siteConfig.address.street} - {siteConfig.address.city}<span className="sr-only"> (abre o mapa em nova aba)</span></span>
            <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
          </Button>
          <Button variant="ghost" nativeButton={false} render={<a href={`https://wa.me/${siteConfig.phoneHref.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" />} className={actionClass}>
            <HelpCircle aria-hidden="true" className="size-5 text-primary" />
            <span className="min-w-0 flex-1">Falar com a Recepção no WhatsApp<span className="sr-only"> (abre em nova aba)</span></span>
          </Button>
        </Card>

        {!accountEditable && <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">Para alterar os dados da conta, fale com a recepção pelo WhatsApp.</p>}
        {editing && (
          <Card id={`${id}-editor`} className="mt-6 rounded-3xl bg-white p-5 shadow-sm">
            <AccountDetailsForm account={{ display_name: user.name, email: user.email, phone: user.phone }}
              credentialsEditable={!isDemo} disabled={loggingOut} onBusyChange={setSaving} onCancel={closeEditor}
              onSave={async (input) => {
                if (onSaveAccount) {
                  const saved = await onSaveAccount(input)
                  setUser({ ...user, name: saved.display_name, email: saved.email, phone: saved.phone ?? "" })
                  setFeedback("Informações da conta atualizadas.")
                  closeEditor()
                } else if (isDemo) {
                  if (await saveProfile({ ...user, name: input.display_name, phone: input.phone })) closeEditor()
                } else throw new Error("Não foi possível salvar as alterações. Tente novamente.")
              }} />
          </Card>
        )}
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        {feedback && <p role="status" className="mt-4 text-sm text-accent-foreground">{feedback}</p>}
        {isDemo && <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">Alterações de perfil salvas apenas nesta sessão.</p>}
        <Button type="button" variant="outline" disabled={loggingOut || saving} onClick={handleLogout} className="my-6 min-h-12 w-full gap-2 rounded-full border-red-200 bg-transparent py-6 font-medium! text-red-600 transition-colors hover:bg-red-50 hover:text-red-600">
          <LogOut aria-hidden="true" className="size-4" /> {loggingOut ? "Saindo da Conta…" : "Sair da Conta"}
        </Button>
      </main>
    </div>
  )
}
