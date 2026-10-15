import { useCallback, useEffect, useRef, useState } from "react"
import { Calendar, DollarSign, LogOut, RefreshCw, User, MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { WHATSAPP_URL } from "@/data/barbershopData"
import BarberDayTools from "@/components/BarberDayTools"
import { Alert, AlertDescription } from "@/components/ui/alert"
import LoginScreen from "./LoginScreen"
import BarberSchedule from "./BarberSchedule"
import { ApiError, api } from "@/services/api"
import { dailySchedule, isAppointmentInProgress, money, shopDate, scheduleTime } from "@/lib/barber-schedule"

/** @param {import("./BarberDashboard.types").BarberDashboardProps} props */
export default function BarberDashboard({ session: initialSession } = {}) {
  const [activeTab, setActiveTab] = useState("agenda")
  const [session, setSession] = useState(initialSession ?? null)
  const [checkingSession, setCheckingSession] = useState(!initialSession)
  const [appointments, setAppointments] = useState([])
  const [blocks, setBlocks] = useState([])
  const [date, setDate] = useState(() => shopDate())
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [startedIds, setStartedIds] = useState(() => new Set())
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const requestId = useRef(0)
  const actionPending = useRef(false)
  const allowed = session?.user.roles.includes("barber")

  useEffect(() => {
    if (initialSession) return
    let active = true
    api.authSession().then((result) => { if (active) setSession(result) })
      .catch(() => { if (active) setError("Não foi possível verificar sua sessão. Tente entrar novamente.") })
      .finally(() => { if (active) setCheckingSession(false) })
    return () => { active = false }
  }, [initialSession])

  const load = useCallback(async () => {
    if (!allowed) return
    const currentRequest = ++requestId.current
    setLoading(true)
    setError("")
    try {
      const from = new Date(`${date}T00:00:00-03:00`)
      const to = new Date(from.getTime() + 24 * 60 * 60 * 1000)
      const range = { from: from.toISOString(), to: to.toISOString() }
      const [result, pauses] = await Promise.all([api.listAppointments(range), api.listOwnBlocks(range)])
      if (currentRequest === requestId.current) { setAppointments(result); setBlocks(pauses) }
    } catch (failure) {
      if (currentRequest === requestId.current) {
        setAppointments([]); setBlocks([])
        setError(failure instanceof ApiError ? failure.message : "Não foi possível carregar a agenda.")
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }, [allowed, session?.user.id, date])

  useEffect(() => {
    void load()
    return () => { requestId.current += 1 }
  }, [load])

  async function updateAppointment(appointment, action) {
    if (actionPending.current) return
    actionPending.current = true
    setBusy(true)
    setError("")
    setNotice("")
    try {
      if (action === "start") {
        await api.startAppointment(appointment.id)
        setStartedIds((previous) => new Set([...previous, appointment.id]))
        setNotice("Atendimento iniciado.")
      } else if (action === "no-show") {
        await api.noShowAppointment(appointment.id)
        setNotice("Falta registrada.")
      } else {
        await api.completeAppointment(appointment.id)
        setStartedIds((previous) => { const next = new Set(previous); next.delete(appointment.id); return next })
        setNotice("Serviço concluído com sucesso.")
      }
      await load()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível atualizar o atendimento.")
    } finally {
      actionPending.current = false
      setBusy(false)
    }
  }

  async function runAction(action, message) {
    if (actionPending.current) return false
    actionPending.current = true; setBusy(true); setError(""); setNotice("")
    try { await action(); setNotice(message); await load(); return true }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível salvar. Tente novamente."); return false }
    finally { actionPending.current = false; setBusy(false) }
  }

  async function logout() {
    if (actionPending.current) return
    actionPending.current = true
    setBusy(true)
    setError("")
    try {
      await api.logout()
      window.location.assign("/login")
    } catch {
      setError("Não foi possível sair da conta. Tente novamente.")
      actionPending.current = false
      setBusy(false)
    }
  }

  if (checkingSession) return <main role="status" className="flex min-h-dvh items-center justify-center bg-background p-5 text-sm text-muted-foreground">Verificando sua sessão…</main>
  if (!session) return <LoginScreen initialError={error} onAuthenticated={(result) => { setError(""); setSession(result) }} />
  if (!allowed) return <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 bg-background p-5 text-center"><h1 className="text-xl font-semibold">Área exclusiva do barbeiro</h1><p className="text-sm text-muted-foreground">Sua conta não possui acesso à agenda profissional.</p><Button nativeButton={false} render={<a href="/home" />} className="min-h-11 rounded-xl px-4">Voltar ao início</Button></main>

  const schedule = dailySchedule(appointments, session.user.id, date)
  const inProgress = date === shopDate() && schedule.items.some((item) => isAppointmentInProgress(item, startedIds))
  const paused = blocks.some((block) => new Date(block.starts_at) <= new Date() && new Date(block.ends_at) > new Date())
  const name = session.user.display_name

  const dateLabel = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" }).format(new Date(`${date}T12:00:00-03:00`))
  const tabs = [{ id: "agenda", label: "Agenda", icon: Calendar }, { id: "ganhos", label: "Meus Ganhos", icon: DollarSign }, { id: "perfil", label: "Perfil", icon: User }]

  return (
    <div className="min-h-dvh bg-[#F4F4F6] font-sans text-[#111111] antialiased">
      <main className="mx-auto flex max-w-xl flex-col gap-3 p-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]">
        {activeTab === "agenda" && <>
          <header className="flex items-center justify-between gap-2 py-1">
            <h1 className="min-w-0 break-words text-base font-semibold">Olá, {name}!</h1>
            <span className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${inProgress ? "bg-amber-50 text-amber-700" : paused ? "bg-gray-100 text-gray-600" : "bg-emerald-50 text-emerald-700"}`}><span aria-hidden="true" className={`size-1.5 rounded-full ${inProgress ? "bg-amber-500" : paused ? "bg-gray-400" : "bg-emerald-500"}`} />{inProgress ? "Em atendimento" : paused ? "Em pausa" : "Disponível"}</span>
          </header>
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto py-1" role="group" aria-label="Consultar data">
              {Array.from({ length: 14 }, (_, index) => {
                const day = new Date(`${shopDate()}T12:00:00-03:00`); day.setUTCDate(day.getUTCDate() + index)
                const value = shopDate(day)
                const label = index === 0 ? "HOJE" : new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short" }).format(day).replace(".", "").toUpperCase()
                return <Button key={value} type="button" disabled={busy} aria-pressed={date === value} onClick={() => setDate(value)} variant={date === value ? "default" : "outline"} className={`min-h-11 shrink-0 snap-start rounded-xl px-3 text-xs! font-semibold! ${date === value ? "" : "bg-white text-gray-600"}`}>{label} {day.getUTCDate()}</Button>
              })}
            </div>
            <Button type="button" variant="ghost" size="icon" disabled={loading || busy} onClick={load} aria-label="Atualizar agenda" className="size-11 rounded-xl text-muted-foreground"><RefreshCw aria-hidden="true" className={`size-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} /></Button>
          </div>
          <BarberDayTools date={date} barberId={session.user.id} busy={busy || loading} onRun={runAction} />
          {blocks.length > 0 && <section aria-label="Pausas bloqueadas" className="flex flex-wrap gap-2">{blocks.map((block) => <span key={block.id} className="rounded-lg bg-white px-2 py-1 text-[11px] text-gray-500">{block.reason || "Pausa"} · {scheduleTime(block.starts_at)}–{scheduleTime(block.ends_at)}</span>)}</section>}
        </>}
        {error && <Alert variant="destructive" className="rounded-xl border-destructive/20 bg-white p-3"><AlertDescription className="text-xs">{error}</AlertDescription></Alert>}
        {notice && <p role="status" className="rounded-xl bg-emerald-50 p-2.5 text-xs text-emerald-700">{notice}</p>}
        {error && appointments.length === 0 && activeTab !== "perfil" && <Button type="button" variant="outline" disabled={busy || loading} onClick={load} className="min-h-11 rounded-xl text-xs!">Tentar carregar novamente</Button>}
        {activeTab === "agenda" && <BarberSchedule appointments={schedule.items} date={date} barberName={name} startedIds={startedIds}
          loading={loading} loadFailed={Boolean(error && appointments.length === 0)}
          onNoShow={(appointment) => updateAppointment(appointment, "no-show")}
          onSaveDetails={(appointment, details) => runAction(() => api.updateAppointmentDetails(appointment.id, details), "Detalhes atualizados.")}
          busy={busy || loading} onStart={(appointment) => updateAppointment(appointment, "start")}
          onComplete={(appointment) => updateAppointment(appointment, "complete")}
        />}
        {activeTab === "ganhos" && <section aria-labelledby="barber-earnings" className="space-y-4">
          <h1 id="barber-earnings" className="text-lg font-semibold">Meus Ganhos & Métricas</h1>
          <label className="block space-y-1 text-xs font-semibold text-gray-600">Consultar dia<Input type="date" value={date} disabled={busy} onChange={(event) => { if (event.target.value) setDate(event.target.value) }} className="rounded-xl bg-white" /></label>
          <p className="text-xs text-muted-foreground">{dateLabel}</p>
          <div aria-busy={loading} className="grid grid-cols-2 gap-3">
            <Card className="gap-1 rounded-2xl bg-white p-4 shadow-sm ring-0"><h2 className="text-xs text-muted-foreground">Serviços concluídos</h2><p className="text-lg font-bold">{loading || error ? "—" : money(schedule.amountCents)}</p></Card>
            <Card className="gap-1 rounded-2xl bg-white p-4 shadow-sm ring-0"><h2 className="text-xs text-muted-foreground">Atendimentos concluídos</h2><p className="text-lg font-bold text-primary">{loading || error ? "—" : `${schedule.completed}/${schedule.total}`}</p></Card>
            <Card className="col-span-2 gap-2 rounded-2xl bg-white p-4 shadow-sm ring-0"><h2 className="text-xs text-muted-foreground">Sua comissão</h2><p className="text-xl font-bold text-primary">{loading || error ? "—" : money(schedule.commissionCents)}</p>{!loading && !error && schedule.commissionPending > 0 && <p className="text-xs text-amber-700">{schedule.commissionPending} sem regra de comissão. Solicite a configuração ao proprietário.</p>}<p className="text-[11px] leading-relaxed text-muted-foreground">Valores dos atendimentos concluídos nesta data. A comissão considera as regras cadastradas e não representa pagamento recebido.</p></Card>
          </div>
          <Button type="button" variant="outline" disabled={busy || loading} onClick={load} className="min-h-11 rounded-xl text-xs!"><RefreshCw className="size-4" />Atualizar ganhos</Button>
        </section>}
        {activeTab === "perfil" && <section aria-labelledby="barber-profile" className="space-y-4">
          <h1 id="barber-profile" className="text-lg font-semibold">Meu Perfil</h1>
          <Card className="gap-4 rounded-2xl bg-white p-4 shadow-sm ring-0">
            <div><p className="text-[11px] text-muted-foreground">Nome</p><p className="break-words text-sm font-semibold">{name}</p></div>
            <div><p className="text-[11px] text-muted-foreground">E-mail</p><p className="break-all text-sm">{session.user.email}</p></div>
            <p className="text-xs text-muted-foreground">Para alterar seus dados ou as regras de comissão, fale com a recepção.</p>
            <Button nativeButton={false} variant="outline" render={<a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" />} className="min-h-11 rounded-xl text-xs!"><MessageSquare className="size-4" />Falar com a recepção</Button>
          </Card>
          <Button type="button" variant="outline" disabled={busy} onClick={logout} className="min-h-11 w-full rounded-xl border-red-200 text-xs! text-red-600 hover:bg-red-50"><LogOut className="size-4" />Sair da conta</Button>
        </section>}
      </main>
      <nav aria-label="Navegação do barbeiro" className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom,0px)]">
        <div className="mx-auto grid max-w-xl grid-cols-3 gap-2 px-4 py-2">
          {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-current={activeTab === id ? "page" : undefined} disabled={busy} onClick={() => { setActiveTab(id); setNotice(""); window.scrollTo({ top: 0, behavior: "instant" }) }} className={`flex min-h-12 touch-manipulation select-none flex-col items-center justify-center gap-1 rounded-xl px-2 py-1 text-[11px]! font-medium! transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 ${activeTab === id ? "bg-blue-50 text-primary" : "text-gray-500 hover:bg-gray-50"}`}><Icon aria-hidden="true" className="size-5" /><span>{label}</span></button>)}
        </div>
      </nav>
    </div>
  )
}
