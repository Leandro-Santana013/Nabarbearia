import { useState } from "react"
import { ChevronDown, Calendar, User, LogOut, Bell, Scissors, MessageSquare, CheckCheck, BellOff } from "lucide-react"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { BARBERSHOP_INFO } from "@/data/barbershopData"
import { DEFAULT_NOTIFICATIONS } from "./header-notifications"
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

/** @param {import("./Header.types").HeaderProps} props */
export default function Header({
  userName = "Cliente", userAvatar, greeting = "Bom dia!",
  isAuthenticated = true, onSignIn,
  notifications = DEFAULT_NOTIFICATIONS, activeAppointmentCount = 0, onNotificationDetails,
  onNotificationClick, onAvatarClick, onViewAppointments, onEditProfile, onLogout,
} = {}) {
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState("")
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [readIds, setReadIds] = useState(() => new Set())
  const initials = userName.trim().split(/\s+/).filter(Boolean).map((name) => name[0]).slice(0, 2).join("").toUpperCase() || "NA"
  const appointments = Math.max(0, activeAppointmentCount)
  const unreadCount = notifications.filter((notification) => !notification.read && !readIds.has(notification.id)).length

  function markRead(notificationId) {
    setReadIds((previous) => new Set([...previous, notificationId]))
  }

  function viewDetails(notification) {
    markRead(notification.id)
    setNotificationsOpen(false)
    if (onNotificationDetails) onNotificationDetails(notification)
    else if (onViewAppointments) onViewAppointments()
    else window.location.assign("/meus-agendamentos")
  }

  async function handleLogout() {
    if (!onLogout || isLoggingOut) return
    setIsLoggingOut(true)
    setLogoutError("")
    try {
      await onLogout()
    } catch {
      setLogoutError("Não foi possível sair da conta. Tente novamente.")
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <header className="flex w-full items-center justify-between gap-3 py-2">
      <h1 className="sr-only">Na Barbearia · Início</h1>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button type="button" variant="ghost" />}
          onClick={onAvatarClick}
          aria-label={`Abrir menu da conta de ${userName}`}
          className="h-auto min-h-14 min-w-0 flex-1 shrink justify-start gap-3 rounded-2xl p-2 text-left whitespace-normal transition-colors hover:bg-card data-popup-open:bg-card"
        >
          <Avatar className="size-11 shrink-0 border border-border/80">
            {userAvatar && <AvatarImage src={userAvatar} alt="" />}
            <AvatarFallback className="bg-accent text-sm font-bold text-accent-foreground">{initials}</AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <span className="block text-xs font-medium text-muted-foreground">{greeting}</span>
            <span className="mt-1 block break-words text-sm font-bold tracking-tight text-foreground sm:text-base">Olá, {userName}</span>
          </span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>

        <DropdownMenuContent aria-label="Menu da conta">
          <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground">
            <Scissors aria-hidden="true" className="size-4 text-primary" /> {BARBERSHOP_INFO.name}
          </div>
          <DropdownMenuItem onClick={onViewAppointments} disabled={!onViewAppointments}>
            <Calendar aria-hidden="true" className="text-primary" />
            <span className="flex-1">Meus Agendamentos</span>
            <Badge aria-label={`${appointments} agendamentos ativos`} className="rounded-full bg-accent px-2 text-accent-foreground">
              {appointments > 99 ? "99+" : appointments}
            </Badge>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onEditProfile} disabled={!onEditProfile}>
            <User aria-hidden="true" className="text-primary" /> Meu Perfil
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {!isAuthenticated && <DropdownMenuItem onClick={onSignIn ?? (() => window.location.assign("/login"))}><User aria-hidden="true" className="text-primary" />Entrar na conta</DropdownMenuItem>}
          {isAuthenticated && <>
          <DropdownMenuItem variant="destructive" disabled={isLoggingOut || !onLogout} closeOnClick={false} onClick={handleLogout}>
            <LogOut aria-hidden="true" /> {isLoggingOut ? "Saindo da Conta…" : "Sair da Conta"}
          </DropdownMenuItem>
          {logoutError && <p role="alert" className="px-3 py-2 text-xs leading-relaxed text-destructive">{logoutError}</p>}
          </>}
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={notificationsOpen} onOpenChange={(open) => {
        setNotificationsOpen(open)
        if (open) onNotificationClick?.()
      }}>
        <div className="relative shrink-0">
          <SheetTrigger render={<Button type="button" variant="outline" size="icon" />} aria-label={unreadCount ? `Notificações: ${unreadCount} não lidas` : "Notificações"} className="size-11 rounded-full border-border bg-card text-foreground shadow-xs transition-colors hover:bg-accent">
            <Bell aria-hidden="true" className="size-5" />
          </SheetTrigger>
          {unreadCount > 0 && (
            <Badge aria-hidden="true" className="pointer-events-none absolute -top-1 -right-1 flex h-5 min-w-5 justify-center rounded-full border-2 border-background bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </div>

        <SheetContent side="right" className="pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <SheetHeader>
            <SheetTitle>Notificações</SheetTitle>
            <SheetDescription>
              Acompanhe seus agendamentos e as novidades da barbearia.
            </SheetDescription>
            <Button type="button" variant="link" disabled={unreadCount === 0} onClick={() => setReadIds((previous) => new Set([...previous, ...notifications.map((notification) => notification.id)]))} className="h-auto min-h-11 justify-start gap-2 p-0 text-xs! font-medium! whitespace-normal text-primary transition-colors hover:underline">
              <CheckCheck aria-hidden="true" className="size-4" /> Marcar todas como lidas
            </Button>
            <p role="status" aria-live="polite" className="sr-only">{unreadCount} notificações não lidas</p>
          </SheetHeader>

          {notifications.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-center text-muted-foreground">
              <BellOff aria-hidden="true" className="size-10 text-muted-foreground/60" />
              <p className="max-w-xs text-sm leading-relaxed">Você não possui novas notificações no momento.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {notifications.map((notification) => {
                const isRead = notification.read || readIds.has(notification.id)
                const Icon = notification.type === "appointment" ? Calendar : notification.type === "whatsapp" ? MessageSquare : Scissors
                const iconStyle = notification.type === "appointment" ? "bg-blue-50 text-primary" : notification.type === "whatsapp" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-600"
                return (
                  <li key={notification.id} className={`rounded-2xl border p-4 ${isRead ? "border-border/60 bg-white" : "border-primary/20 bg-blue-50/30"}`}>
                    <div className="flex items-start gap-3">
                      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl p-2 ${iconStyle}`}>
                        <Icon aria-hidden="true" className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1 space-y-2">
                        <h3 className="flex items-start justify-between gap-2 text-sm font-semibold">
                          <span className="break-words">{notification.title}</span>
                          {!isRead && <span className="mt-1 size-2 shrink-0 rounded-full bg-primary"><span className="sr-only">Não lida</span></span>}
                        </h3>
                        <p className="break-words text-sm leading-relaxed text-muted-foreground">{notification.description}</p>
                        <p className="text-xs text-muted-foreground">{notification.time}</p>
                        <div className="flex flex-wrap gap-x-3">
                          {notification.type === "appointment" && (
                            <Button type="button" variant="outline" onClick={() => viewDetails(notification)} className="min-h-11 rounded-full border-primary/20 bg-white px-3 text-xs! text-primary transition-colors hover:bg-accent">Ver Detalhes</Button>
                          )}
                          {!isRead && (
                            <Button type="button" variant="link" onClick={() => markRead(notification.id)} aria-label={`Marcar ${notification.title} como lida`} className="min-h-11 px-0 text-xs! text-primary transition-colors">Marcar como lida</Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </SheetContent>
      </Sheet>
    </header>
  )
}
