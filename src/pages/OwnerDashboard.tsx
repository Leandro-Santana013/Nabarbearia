import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./owner-mobile.css";
import {
  ArrowRightLeft,
  Calendar,
  ChevronDown,
  DollarSign,
  LogOut,
  Plus,
  RefreshCw,
  Scissors,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import OwnerEditor, { type Editor } from "@/components/owner/OwnerEditor";
import OwnerSelect from "@/components/owner/OwnerSelect";
import { useAccess } from "@/lib/access/AccessProvider";
import { isManagement, isSuperAdmin } from "@/lib/access/routing";
import { useAndroidReady } from "@/lib/android-startup";
import BarberDashboard from "./BarberDashboard";
import { api, type AuthResponse } from "@/services/api";
import { money, shopDate } from "@/lib/barber-schedule";
import {
  ownerAgendaRows,
  noShowRate,
  ownerRange,
  type OwnerScheduleInterval,
  type OwnerSummary,
} from "@/lib/owner-dashboard";
import type { Appointment, Service } from "@/types";

const sections = [
  { value: "financeiro", label: "Financeiro", icon: DollarSign },
  { value: "barbeiros", label: "Equipe", icon: Users },
  { value: "agenda-geral", label: "Agenda Geral", icon: Calendar },
  { value: "servicos", label: "Serviços", icon: Scissors },
];
const statusLabel: Record<Appointment["status"], string> = {
  confirmed: "Agendado",
  completed: "Concluído",
  "no-show": "Falta",
  cancelled: "Cancelado",
};
const button = "min-h-10 rounded-xl px-3 text-xs! font-semibold!";
export default function OwnerDashboard({
  path,
  onNavigate,
  session,
}: {
  path: string;
  onNavigate: (path: string) => void;
  session: AuthResponse;
}) {
  const { refresh: refreshSession, logout: logoutSession } = useAccess();
  const [summary, setSummary] = useState<OwnerSummary | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [schedules, setSchedules] = useState<OwnerScheduleInterval[]>([]);
  const [availabilityBlocks, setAvailabilityBlocks] = useState<Awaited<ReturnType<typeof api.listOwnerBlocks>>>([]);
  const [period, setPeriod] = useState<"day" | "month">("month");
  const [reportDate, setReportDate] = useState(shopDate);
  const [agendaDate, setAgendaDate] = useState(shopDate);
  const [barberFilter, setBarberFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [loading, setLoading] = useState(true);
  const [agendaLoading, setAgendaLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [agendaError, setAgendaError] = useState("");
  const [notice, setNotice] = useState("");
  const [hybridPrompt, setHybridPrompt] = useState(false);
  const [recurringBarberId, setRecurringBarberId] = useState("");
  const [recurringWeekday, setRecurringWeekday] = useState("1");
  const [recurringStart, setRecurringStart] = useState("09:00");
  const [recurringEnd, setRecurringEnd] = useState("18:00");
  const [recurringAllDay, setRecurringAllDay] = useState(true);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [recurringRules, setRecurringRules] = useState<Awaited<ReturnType<typeof api.listRecurringBlocks>>>([]);
  const sequence = useRef(0);
  const agendaSequence = useRef(0);
  const pending = useRef(false);
  const superAdmin = isSuperAdmin(session.user);
  const allowed = isManagement(session.user);
  const visibleSections = superAdmin
    ? sections
    : sections.filter((item) => item.value !== "financeiro");
  const tab = visibleSections.some((item) => path === `/gestao/${item.value}`)
    ? path.split("/").at(-1)!
    : superAdmin ? "financeiro" : "agenda-geral";
  const activeSectionIndex = visibleSections.findIndex((section) => section.value === tab);
  const hybrid = superAdmin && path === "/gestao/minha-agenda";
  useAndroidReady(!hybrid && !loading && (tab !== "agenda-geral" || !agendaLoading));
  const range = useMemo(
    () => ownerRange(reportDate, period),
    [reportDate, period],
  );
  useEffect(() => {
    if (!superAdmin && (path === "/gestao/financeiro" || path === "/gestao/minha-agenda")) {
      onNavigate("/gestao/agenda-geral");
    }
  }, [onNavigate, path, superAdmin]);
  useEffect(() => {
    // Pinch zoom and mobile browser chrome can leave the visual viewport
    // narrower than CSS media queries report. Reflow without disabling zoom.
    const viewport = window.visualViewport;
    const updateViewport = () => {
      document.documentElement.style.setProperty(
        "--owner-viewport-width",
        `${Math.min(window.innerWidth, viewport?.width ?? window.innerWidth)}px`,
      );
      document.documentElement.style.setProperty(
        "--owner-viewport-height",
        `${Math.min(window.innerHeight, viewport?.height ?? window.innerHeight)}px`,
      );
      document.documentElement.style.setProperty(
        "--owner-viewport-top",
        `${viewport?.offsetTop ?? 0}px`,
      );
      document.documentElement.style.setProperty(
        "--owner-viewport-left",
        `${viewport?.offsetLeft ?? 0}px`,
      );
    };
    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);
    return () => {
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
      document.documentElement.style.removeProperty("--owner-viewport-width");
      document.documentElement.style.removeProperty("--owner-viewport-height");
      document.documentElement.style.removeProperty("--owner-viewport-top");
      document.documentElement.style.removeProperty("--owner-viewport-left");
    };
  }, []);
  const refresh = useCallback(async () => {
    if (!allowed) return;
    const request = ++sequence.current;
    setLoading(true);
    try {
      const [data, catalog] = await Promise.all([
        api.getOwnerSummary(range),
        api.getAdminServices(),
      ]);
      if (request === sequence.current) {
        setSummary(data);
        setServices(catalog);
        setError("");
      }
    } catch (failure) {
      if (request === sequence.current) {
        setSummary(null);
        setServices([]);
        setError(
          failure instanceof Error
            ? failure.message
            : "Falha ao carregar gestão.",
        );
      }
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, [allowed, range]);
  const loadAgenda = useCallback(async () => {
    if (!allowed) return;
    const request = ++agendaSequence.current;
    setAgendaLoading(true);
    setAgendaError("");
    setAppointments([]);
    setSchedules([]);
    try {
      const [data, daySchedules, blocks, rules] = await Promise.all([
        api.listAppointments(ownerRange(agendaDate, "day")),
        api.listOwnerSchedules(agendaDate),
        api.listOwnerBlocks(ownerRange(agendaDate, "day")),
        api.listRecurringBlocks(),
      ]);
      if (request === agendaSequence.current) {
        setAppointments(data);
        setSchedules(daySchedules);
        setAvailabilityBlocks(blocks);
        setRecurringRules(rules);
      }
    } catch (failure) {
      if (request === agendaSequence.current) {
        setAppointments([]);
        setSchedules([]);
        setAvailabilityBlocks([]);
        setAgendaError(
          failure instanceof Error
            ? failure.message
            : "Falha ao carregar agenda.",
        );
      }
    } finally {
      if (request === agendaSequence.current) setAgendaLoading(false);
    }
  }, [allowed, agendaDate]);
  useEffect(() => {
    void refresh();
    return () => {
      sequence.current++;
    };
  }, [refresh]);
  useEffect(() => {
    if (tab === "agenda-geral" && !hybrid) void loadAgenda();
    return () => {
      agendaSequence.current++;
    };
  }, [tab, hybrid, loadAgenda]);
  useEffect(() => {
    setSelected([]);
  }, [agendaDate, barberFilter]);
  async function run(action: () => Promise<void>, message: string) {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(message);
      await refresh();
      if (tab === "agenda-geral") await loadAgenda();
      setSelected([]);
      return true;
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Não foi possível salvar.",
      );
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function saveRecurringBlock() {
    const startMinute = recurringAllDay ? 0 : Number(recurringStart.slice(0, 2)) * 60 + Number(recurringStart.slice(3))
    const endMinute = recurringAllDay ? 1440 : Number(recurringEnd.slice(0, 2)) * 60 + Number(recurringEnd.slice(3))
    await run(
      () => api.createRecurringBlock({ barber_user_id: recurringBarberId, weekday: Number(recurringWeekday), start_minute: startMinute, end_minute: endMinute, block_type: "day_off", reason: "Folga recorrente" }),
      "Folga recorrente cadastrada.",
    )
  }
  async function logout() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await logoutSession();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Não foi possível sair da conta. Tente novamente.",
      );
      pending.current = false;
      setBusy(false);
    }
  }
  function edit(value: Editor) {
    setError("");
    setNotice("");
    setEditor(value);
  }
  async function enterHybrid() {
    if (session.user.roles.includes("barber")) {
      onNavigate("/gestao/minha-agenda");
      return;
    }
    if (
      await run(async () => {
        await api.enableHybrid();
        const updated = await refreshSession();
        if (!updated) throw new Error("Entre novamente para acessar a agenda.");
      }, "Agenda pessoal ativada.")
    ) {
      setHybridPrompt(false);
      onNavigate("/gestao/minha-agenda");
    }
  }
  const team = summary?.team ?? [];
  const agendaBarbers = team.filter(
    (item) => barberFilter === "all" || item.id === barberFilter,
  );
  const visible = appointments
    .filter((item) => barberFilter === "all" || item.barberId === barberFilter)
    .sort((a, b) => (a.startsAt ?? a.date).localeCompare(b.startsAt ?? b.date));
  const agendaRows = useMemo(
    () => ownerAgendaRows(
      appointments,
      schedules,
      agendaBarbers,
      agendaDate,
      recurringRules.map((rule) => ({ barberId: rule.barber_user_id, weekday: rule.weekday, startMinute: rule.start_minute, endMinute: rule.end_minute })),
      availabilityBlocks.map((block) => ({ id: block.id, barberId: block.barber_user_id, barberName: block.barber_name, startsAt: block.starts_at, endsAt: block.ends_at, reason: block.reason, blockType: block.block_type })),
    ),
    [appointments, schedules, agendaBarbers, agendaDate, recurringRules, availabilityBlocks],
  );
  const dayRecurringRules = recurringRules.filter((rule) => rule.weekday === new Date(`${agendaDate}T12:00:00`).getDay());
  const eligible = visible.filter(
    (item) => item.status === "confirmed" && !item.executionStarted,
  );
  const chosen = eligible.filter((item) => selected.includes(item.id));
  const shopNow = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
  const [shopHour, shopMinute] = shopNow.split(":").map(Number);
  const currentMinute = shopHour * 60 + shopMinute;
  const periodLabel = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    ...(period === "month"
      ? { month: "long", year: "numeric" }
      : { dateStyle: "long" }),
  }).format(new Date(`${reportDate}T12:00:00-03:00`));
  if (hybrid) return <BarberDashboard session={session} onManage={() => onNavigate("/gestao/financeiro")} />

  return (
    <div className="owner-dashboard min-h-dvh bg-background text-foreground">
      <div className="owner-container mx-auto max-w-6xl space-y-4 px-4 py-5 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]">
        <header className="owner-header flex flex-col justify-between gap-3 rounded-2xl border border-border/60 bg-white p-4 shadow-sm md:flex-row md:items-center">
          <div className="owner-heading min-w-0">
            <img src="/brand/optimized/logo-256.webp" alt="" width="256" height="256" className="owner-logo" />
            <div className="min-w-0">
              <Badge className="mb-1 rounded-full border-0 bg-blue-50 px-2.5 text-[10px] text-primary">
                {superAdmin ? "Super Administrador" : "Administrador"}
              </Badge>
              <h1 className="text-lg font-semibold">
                Painel de Gestão — NA Barbearia
              </h1>
              <p className="mt-1 break-words text-xs text-muted-foreground">
                {session.user.display_name}
              </p>
            </div>
          </div>
          <div className="owner-header-actions flex flex-wrap gap-2">
            {superAdmin && session.user.roles.includes("barber") ? (
              <Button
                variant="outline"
                className={button}
                disabled={busy}
                onClick={() => void enterHybrid()}
              >
                <ArrowRightLeft className="size-4" />
                Modo Híbrido: Minha Agenda
              </Button>
            ) : superAdmin ? (
              <Dialog open={hybridPrompt} onOpenChange={setHybridPrompt}>
                <DialogTrigger
                  render={<Button variant="outline" className={button} disabled={busy} />}
                >
                  <ArrowRightLeft className="size-4" />
                  Modo Híbrido: Minha Agenda
                </DialogTrigger>
                <DialogContent className="owner-dialog">
                  <DialogTitle className="pr-8 text-lg font-semibold">
                    Ativar minha agenda profissional
                  </DialogTitle>
                  <DialogDescription className="text-sm text-muted-foreground">
                    Você será incluído na equipe como barbeiro e manterá o
                    acesso de proprietário. Depois, poderá configurar seus
                    horários para receber reservas.
                  </DialogDescription>
                  {error && (
                    <p role="alert" className="text-sm text-destructive">
                      {error}
                    </p>
                  )}
                  <Button
                    disabled={busy}
                    className={button}
                    onClick={() => void enterHybrid()}
                  >
                    Ativar e abrir minha agenda
                  </Button>
                </DialogContent>
              </Dialog>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sair da gestão"
              disabled={busy}
              onClick={() => void logout()}
              className="size-10 rounded-xl"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </header>
        <>
            <Tabs
              value={tab}
              onValueChange={(value) => {
                setNotice("");
                onNavigate(`/gestao/${value}`);
                if (window.matchMedia("(max-width: 767.98px)").matches)
                  window.scrollTo({ top: 0, behavior: "instant" });
              }}
              className="space-y-4"
            >
              <TabsList aria-label="Navegação da gestão" className="grid-cols-2 rounded-2xl border border-border/60 bg-white p-1 sm:grid-cols-4">
                <span
                  aria-hidden="true"
                  className="owner-tab-indicator hidden"
                  style={{
                    transform: `translateX(calc(${activeSectionIndex} * (100% + 4px)))`,
                  }}
                />
                {visibleSections.map(({ value, label, icon: Icon }) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="gap-1.5 rounded-xl px-2 text-xs! font-semibold!"
                  >
                    <Icon aria-hidden="true" className="size-4" />
                    <span className="owner-tab-label">{label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
              {tab !== "agenda-geral" && tab !== "servicos" && (
                <div className="owner-period-filters flex flex-wrap items-end gap-3">
                  <div className="w-40">
                    <OwnerSelect
                      label="Período"
                      value={period}
                      onChange={(value) => setPeriod(value as "day" | "month")}
                      options={[
                        { value: "month", label: "Mês" },
                        { value: "day", label: "Dia" },
                      ]}
                    />
                  </div>
                  <label className="min-w-0 space-y-1 text-xs font-semibold text-gray-600">
                    {period === "month"
                      ? "Mês de referência"
                      : "Data de referência"}
                    <Input
                      type={period === "month" ? "month" : "date"}
                      value={
                        period === "month" ? reportDate.slice(0, 7) : reportDate
                      }
                      onChange={(e) => {
                        if (e.target.value)
                          setReportDate(
                            period === "month"
                              ? `${e.target.value}-01`
                              : e.target.value,
                          );
                      }}
                      className="h-11 rounded-xl bg-white"
                    />
                  </label>
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={loading || busy}
                    onClick={() => void refresh()}
                    aria-label="Atualizar gestão"
                    className="size-11 rounded-xl bg-white"
                  >
                    <RefreshCw className="size-4" />
                  </Button>
                </div>
              )}
              {error && (
                <div
                  role="alert"
                  className="rounded-xl bg-red-50 p-3 text-xs text-red-700"
                >
                  {error}
                  <Button
                    variant="link"
                    className="ml-2 text-xs!"
                    onClick={() => void refresh()}
                  >
                    Tentar novamente
                  </Button>
                </div>
              )}
              {notice && (
                <p
                  role="status"
                  className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700"
                >
                  {notice}
                </p>
              )}
              {superAdmin && <TabsContent value="financeiro">
                <p className="text-xs capitalize text-muted-foreground">
                  {periodLabel}
                </p>
                <div className="owner-metrics grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Metric
                    label="Faturamento total"
                    value={summary?.revenue_cents !== undefined ? money(summary.revenue_cents) : "—"}
                    description="Serviços concluídos no período"
                  />
                  <Metric
                    label="Comissões a pagar"
                    value={summary?.outstanding_cents !== undefined ? money(summary.outstanding_cents) : "—"}
                    description="Saldo acumulado ainda não repassado"
                  />
                  <Metric
                    label="Lucro líquido"
                    value="Não apurado"
                    description={
                      summary
                        ? summary.retained_cents !== undefined
                          ? `Após comissões: ${money(summary.retained_cents)}. Despesas e impostos não cadastrados.`
                          : "Aguardando dados financeiros"
                        : "Aguardando dados financeiros"
                    }
                  />
                  <Metric
                    label="Atendimentos / No-show"
                    value={
                      summary
                        ? `${summary.completed_count} / ${noShowRate(summary)}%`
                        : "—"
                    }
                    description="Concluídos / taxa de faltas entre reservas não canceladas"
                  />
                </div>
                {loading && (
                  <p role="status" className="text-xs text-muted-foreground">
                    Atualizando indicadores…
                  </p>
                )}
                {!!summary?.commission_pending_count && (
                  <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                    {summary.commission_pending_count} atendimento(s) sem
                    comissão calculada. Configure as regras na aba Equipe; o
                    resultado após comissões permanece parcial.
                  </p>
                )}
                <Card className="rounded-2xl bg-white shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold">
                      Resumo por forma de pagamento prevista
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Valores de serviços concluídos. As formas informadas ainda
                      não comprovam recebimento.
                    </p>
                  </CardHeader>
                  <CardContent className="px-0">
                    <Table className="owner-payments-table">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Forma</TableHead>
                          <TableHead>Atendimentos</TableHead>
                          <TableHead>Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[
                          "Pix",
                          "Cartão",
                          "Dinheiro",
                          "Presencial",
                          "Não informado",
                        ].map((method) => {
                          const rows =
                            summary?.payments?.filter(
                              (item) => item.method === method,
                            ) ?? [];
                          return (
                            <TableRow key={method}>
                              <TableCell>{method}</TableCell>
                              <TableCell>
                                {summary
                                  ? rows.reduce((n, item) => n + item.count, 0)
                                  : "—"}
                              </TableCell>
                              <TableCell>
                                {summary
                                  ? money(
                                      rows.reduce(
                                        (n, item) => n + item.amount_cents,
                                        0,
                                      ),
                                    )
                                  : "—"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
                <Card className="rounded-2xl bg-white shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold">
                      Repasses registrados no período
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {summary?.payouts?.length ? (
                      <ul className="divide-y">
                        {summary.payouts.map((item) => (
                          <li
                            key={item.id}
                            className="flex flex-wrap justify-between gap-2 py-3 text-xs"
                          >
                            <span>
                              {item.barber_name} ·{" "}
                              {shopDate(new Date(item.created_at))
                                .split("-")
                                .reverse()
                                .join("/")}
                            </span>
                            <strong>{money(item.amount_cents)}</strong>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Nenhum repasse registrado neste período.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>}
              <TabsContent value="barbeiros">
                <Card className="rounded-2xl bg-white shadow-sm">
                  <CardHeader className="owner-section-heading flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-sm font-semibold">
                        Equipe ({team.length} profissionais)
                      </CardTitle>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {superAdmin
                          ? "Produção no período selecionado. Saldo a pagar considera todo o histórico."
                          : "Gerencie os profissionais e as escalas da equipe."}
                      </p>
                    </div>
                    <Button
                      className={button}
                      disabled={loading || busy}
                      onClick={() => edit({ kind: "barber" })}
                    >
                      <Plus className="size-4" />
                      Novo barbeiro
                    </Button>
                  </CardHeader>
                  <CardContent className="px-0">
                    <Table className="owner-mobile-table owner-team-table" role="table">
                      <TableHeader>
                        <TableRow>
                          {[
                            "Barbeiro",
                            "Atendimentos",
                            ...(superAdmin ? ["Faturamento", "Comissão configurada", "A repassar"] : []),
                            "Ações",
                          ].map((text) => (
                            <TableHead key={text}>{text}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {team.map((item) => {
                          const rules = summary?.rules?.filter(
                            (rule) =>
                              rule.barber_id === item.id ||
                              rule.barber_id === null,
                          ) ?? [];
                          return (
                            <TableRow key={item.id} role="row">
                              <TableCell role="cell" className="owner-row-title">
                                <div className="flex min-w-40 items-center gap-2">
                                  <Avatar className="size-9">
                                    <AvatarImage src={item.photo_url} />
                                    <AvatarFallback>
                                      {item.name.slice(0, 2)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div>
                                    <p className="text-sm font-semibold">
                                      {item.name}
                                    </p>
                                    <Badge
                                      className={`border-0 text-[10px] ${item.active ? "bg-blue-50 text-primary" : "bg-gray-100 text-gray-500"}`}
                                    >
                                      {item.active ? "Ativo" : "Inativo"}
                                    </Badge>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell role="cell" data-label="Atendimentos">{item.completed_count}</TableCell>
                              {superAdmin && <TableCell role="cell" data-label="Faturamento" className="whitespace-nowrap">
                                {item.revenue_cents === undefined ? "—" : money(item.revenue_cents)}
                              </TableCell>}
                              {superAdmin && <TableCell role="cell" data-label="Comissão configurada" className="owner-row-wide">
                                <div className="min-w-40 space-y-1 text-xs">
                                  {rules.length
                                    ? rules.map((rule) => (
                                        <p key={rule.id}>
                                          {rule.rule_type === "percent"
                                            ? `${rule.amount / 100}%`
                                            : money(rule.amount)}{" "}
                                          ·{" "}
                                          {rule.service_id
                                            ? (services.find(
                                                (service) =>
                                                  service.id ===
                                                  rule.service_id,
                                              )?.name ?? "Serviço específico")
                                            : "Geral"}
                                          {rule.valid_from || rule.valid_until
                                            ? " (com vigência)"
                                            : ""}
                                        </p>
                                      ))
                                    : "Não configurada"}
                                </div>
                              </TableCell>}
                              {superAdmin && <TableCell role="cell" data-label="A repassar" className="owner-row-wide font-semibold whitespace-nowrap text-primary">
                                {item.outstanding_cents === undefined ? "—" : money(item.outstanding_cents)}
                              </TableCell>}
                              <TableCell role="cell" className="owner-row-actions">
                                <div className="flex min-w-52 flex-wrap gap-1.5">
                                  {superAdmin && <Button
                                    variant="outline"
                                    className={button}
                                    onClick={() =>
                                      edit({ kind: "commission", item })
                                    }
                                  >
                                    Comissão
                                  </Button>}
                                  <Button
                                    variant="outline"
                                    className={button}
                                    onClick={() =>
                                      edit({ kind: "barber", item })
                                    }
                                  >
                                    Editar
                                  </Button>
                                  <Button
                                    variant="outline"
                                    className={button}
                                    onClick={() =>
                                      edit({ kind: "schedule", item })
                                    }
                                  >
                                    Escala
                                  </Button>
                                  {superAdmin && <Button
                                    className={button}
                                    disabled={
                                      busy || item.outstanding_cents === undefined || item.outstanding_cents <= 0
                                    }
                                    onClick={() =>
                                      edit({ kind: "payout", item })
                                    }
                                  >
                                    Registrar repasse
                                  </Button>}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    {!loading && !team.length && (
                      <p className="p-4 text-sm text-muted-foreground">
                        Nenhum barbeiro cadastrado. Cadastre a equipe para
                        começar.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="agenda-geral">
                <Card className="mb-4 rounded-2xl bg-white shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <CardTitle className="text-sm font-semibold">Folgas recorrentes</CardTitle>
                      {!recurringOpen && <p className="mt-1 text-xs text-muted-foreground">{recurringRules.length ? `${recurringRules.length} horário(s) fechado(s) toda semana` : "Nenhuma folga recorrente cadastrada"}</p>}
                    </div>
                    <Button type="button" variant="outline" aria-expanded={recurringOpen} onClick={() => setRecurringOpen((open) => !open)} className="h-9 shrink-0 rounded-xl px-3 text-xs">
                      {recurringOpen ? "Minimizar" : "Configurar"}<ChevronDown aria-hidden="true" className={`ml-1 size-4 transition-transform ${recurringOpen ? "rotate-180" : ""}`} />
                    </Button>
                  </CardHeader>
                  {recurringOpen && <>
                  <CardContent className="grid gap-3 border-t border-border/60 pt-3 sm:grid-cols-2 lg:grid-cols-5">
                    <label className="space-y-1 text-xs font-semibold text-gray-600">Profissional<select value={recurringBarberId} onChange={(event) => setRecurringBarberId(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-white px-3 text-sm"><option value="">Selecione</option>{team.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                    <label className="space-y-1 text-xs font-semibold text-gray-600">Dia da semana<select value={recurringWeekday} onChange={(event) => setRecurringWeekday(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-white px-3 text-sm">{["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"].map((label, index) => <option key={label} value={index}>{label}</option>)}</select></label>
                    {!recurringAllDay && <label className="space-y-1 text-xs font-semibold text-gray-600">Início<Input type="time" step="900" value={recurringStart} onChange={(event) => setRecurringStart(event.target.value)} className="h-11 rounded-xl bg-white" /></label>}
                    {!recurringAllDay && <label className="space-y-1 text-xs font-semibold text-gray-600">Fim<Input type="time" step="900" value={recurringEnd} onChange={(event) => setRecurringEnd(event.target.value)} className="h-11 rounded-xl bg-white" /></label>}
                    <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-1"><label className="flex min-h-11 items-center gap-2 text-xs font-semibold text-gray-600"><input type="checkbox" checked={recurringAllDay} onChange={(event) => setRecurringAllDay(event.target.checked)} />Dia inteiro</label><Button type="button" disabled={busy || !recurringBarberId} onClick={() => void saveRecurringBlock()} className={button}><Plus className="size-4" />Adicionar</Button></div>
                  </CardContent>
                  {!!recurringRules.length && <CardContent className="border-t border-border/60 pt-3"><ul className="space-y-2">{recurringRules.map((rule) => <li key={rule.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-xs"><span><strong>{rule.barber_name}</strong> · {["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"][rule.weekday]} · {rule.start_minute === 0 && rule.end_minute === 1440 ? "dia inteiro" : `${String(Math.floor(rule.start_minute / 60)).padStart(2, "0")}h–${String(Math.floor(rule.end_minute / 60)).padStart(2, "0")}h`}</span><Button type="button" variant="outline" disabled={busy} className={button} onClick={() => void run(() => api.deleteRecurringBlock(rule.id), "Folga recorrente removida.")}>Remover</Button></li>)}</ul></CardContent>}
                  </>}
                </Card>
                <div className="owner-agenda-filters grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <label className="space-y-1 text-xs font-semibold text-gray-600">
                    Data da agenda
                    <Input
                      type="date"
                      value={agendaDate}
                      disabled={busy}
                      onChange={(e) => {
                        if (e.target.value) setAgendaDate(e.target.value);
                      }}
                      className="rounded-xl bg-white"
                    />
                  </label>
                  <OwnerSelect
                    label="Filtrar profissional"
                    value={barberFilter}
                    onChange={setBarberFilter}
                    options={[
                      { value: "all", label: "Todos os profissionais" },
                      ...team.map((item) => ({
                        value: item.id,
                        label: item.name,
                      })),
                    ]}
                  />
                  <Button
                    disabled={busy || agendaLoading}
                    variant="outline"
                    className={button}
                    onClick={() => void loadAgenda()}
                  >
                    <RefreshCw className="size-4" />
                    Atualizar
                  </Button>
                </div>
                {agendaError && (
                  <p role="alert" className="text-xs text-destructive">
                    {agendaError}
                  </p>
                )}
                {(availabilityBlocks.length > 0 || dayRecurringRules.length > 0) && <details className="mb-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
                  <summary className="cursor-pointer text-xs font-semibold text-amber-950">Folgas, compromissos e férias ({availabilityBlocks.length + dayRecurringRules.length})</summary>
                  <ul className="mt-2 space-y-1.5">
                    {availabilityBlocks.map((block) => <li key={block.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-white px-3 py-2 text-xs">
                      <span><strong>{block.barber_name}</strong> · {block.block_type === "appointment" ? "Compromisso" : block.block_type === "vacation" ? "Férias" : block.block_type === "day_off" ? "Folga" : block.block_type === "break" ? "Pausa" : "Bloqueio"}{block.reason && !["Compromisso", "Folga", "Férias", "Pausa", "Outro"].includes(block.reason) ? ` · ${block.reason}` : ""}</span>
                      <span className="text-muted-foreground">{shopDate(new Date(block.starts_at)) === agendaDate ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(block.starts_at)) : "00:00"}–{shopDate(new Date(block.ends_at)) === agendaDate ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(block.ends_at)) : "24:00"}</span>
                    </li>)}
                    {dayRecurringRules.map((rule) => <li key={rule.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-white px-3 py-2 text-xs">
                      <span><strong>{rule.barber_name}</strong> · {rule.block_type === "vacation" ? "Férias recorrentes" : rule.block_type === "appointment" ? "Compromisso recorrente" : "Folga recorrente"}{rule.reason && !["Folga recorrente", "Férias", "Compromisso"].includes(rule.reason) ? ` · ${rule.reason}` : ""}</span>
                      <span className="text-muted-foreground">{rule.start_minute === 0 && rule.end_minute === 1440 ? "Dia inteiro" : `${String(Math.floor(rule.start_minute / 60)).padStart(2, "0")}:${String(rule.start_minute % 60).padStart(2, "0")}–${String(Math.floor(rule.end_minute / 60)).padStart(2, "0")}:${String(rule.end_minute % 60).padStart(2, "0")}`}</span>
                    </li>)}
                  </ul>
                </details>}
                <div className="owner-bulk-actions flex flex-wrap items-center gap-2">
                  <label className="owner-agenda-select-all flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos os agendamentos elegíveis"
                      disabled={busy || !eligible.length}
                      checked={
                        eligible.length > 0 && chosen.length === eligible.length
                      }
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? eligible.map((item) => item.id)
                            : [],
                        )
                      }
                    />
                    Selecionar todos os agendamentos elegíveis
                  </label>
                  <span className="mr-auto text-xs text-muted-foreground">
                    {chosen.length} selecionado(s)
                  </span>
                  <Button
                    disabled={chosen.length !== 1 || busy}
                    variant="outline"
                    className={button}
                    onClick={() => edit({ kind: "appointment", item: chosen[0] })}
                  >
                    Editar agendamento
                  </Button>
                  <Button
                    disabled={!chosen.length || busy}
                    variant="destructive"
                    className={button}
                    onClick={() =>
                      edit({ kind: "bulk", items: chosen })
                    }
                  >
                    Cancelar selecionados
                  </Button>
                </div>
                <Card className="rounded-2xl bg-white py-0 shadow-sm">
                  <div className="owner-agenda-grid-scroll overflow-x-auto">
                    <Table
                      className={`owner-agenda-grid${agendaBarbers.length === 1 ? " owner-agenda-grid-single" : ""}`}
                      role="table"
                    >
                      <TableHeader>
                        <TableRow>
                          <TableHead className="owner-agenda-time">
                            Horário
                          </TableHead>
                          {agendaBarbers.map((barber) => (
                            <TableHead
                              className="owner-agenda-barber text-center"
                              key={barber.id}
                            >
                              {barber.name}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {agendaRows.map((row) => (
                          <TableRow key={row.minute}>
                            <TableCell className="owner-agenda-time font-semibold whitespace-nowrap">
                              {row.time}
                            </TableCell>
                            {row.cells.map((cell) => {
                              const selectedAppointmentIds =
                                cell.appointments.filter((item) =>
                                  selected.includes(item.id),
                                );
                              return (
                                <TableCell
                                  className="owner-agenda-cell text-center"
                                  key={`${row.minute}-${cell.barberId}`}
                                >
                                  {cell.appointments.length ? (
                                    <div className="space-y-1">
                                      {cell.recurringBlocked && <Badge className="border-0 bg-amber-50 text-[10px] text-amber-800">Horário fechado</Badge>}
                                      {cell.availabilityBlocks.map((block) => <Badge key={block.id} className="border-0 bg-amber-50 text-[10px] text-amber-800">{block.blockType === "appointment" ? "Compromisso" : block.blockType === "vacation" ? "Férias" : block.blockType === "day_off" ? "Folga" : block.blockType === "break" ? "Pausa" : "Bloqueado"}</Badge>)}
                                      {cell.appointments.map((item) => {
                                        const canSelect =
                                          item.status === "confirmed" &&
                                          !item.executionStarted;
                                        const isSelected =
                                          selectedAppointmentIds.some(
                                            (selectedItem) =>
                                              selectedItem.id === item.id,
                                          );
                                        const details = (
                                          <>
                                            <span className="block text-sm font-semibold">
                                              {item.clientName}
                                            </span>
                                            {item.serviceName && (
                                              <span className="block text-xs text-muted-foreground">
                                                {item.serviceName}
                                              </span>
                                            )}
                                            <Badge className="mt-1 border-0 bg-blue-50 text-[10px] text-primary">
                                              {item.status === "confirmed" &&
                                              item.executionStarted
                                                ? "Em atendimento"
                                                : statusLabel[item.status]}
                                            </Badge>
                                            {item.clientNote && (
                                              <span className="mt-1 block text-[11px] text-amber-700">
                                                Obs: {item.clientNote}
                                              </span>
                                            )}
                                          </>
                                        );
                                        return canSelect ? (
                                          <div
                                            className="relative"
                                            key={item.id}
                                          >
                                            <button
                                              aria-label={`${isSelected ? "Desselecionar" : "Selecionar"} agendamento de ${item.clientName} às ${row.time}`}
                                              aria-pressed={isSelected}
                                              className={`owner-agenda-booking w-full rounded-lg border p-2 text-left ${isSelected ? "border-primary bg-blue-50" : "border-border bg-white"}`}
                                              disabled={busy}
                                              onClick={() =>
                                                setSelected((old) =>
                                                  isSelected
                                                    ? old.filter(
                                                        (id) => id !== item.id,
                                                      )
                                                    : [...old, item.id],
                                                )
                                              }
                                              type="button"
                                            >
                                              {details}
                                            </button>
                                          </div>
                                        ) : (
                                          <div
                                            className="owner-agenda-booking rounded-lg border border-border p-2"
                                            key={item.id}
                                          >
                                            {details}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : cell.recurringBlocked || cell.availabilityBlocks.length ? (
                                    <div className="flex flex-col items-center gap-1">
                                      {cell.recurringBlocked && <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-800">Fechado</span>}
                                      {cell.availabilityBlocks.map((block) => <span key={block.id} className="inline-flex items-center rounded-full bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-800">{block.blockType === "appointment" ? "Compromisso" : block.blockType === "vacation" ? "Férias" : block.blockType === "day_off" ? "Folga" : block.blockType === "break" ? "Pausa" : "Bloqueado"}</span>)}
                                    </div>
                                  ) : cell.inSchedule ? (
                                    <button
                                      aria-label={`Agendar às ${row.time} com ${agendaBarbers.find((item) => item.id === cell.barberId)?.name ?? "profissional"}`}
                                      className="owner-agenda-booking owner-agenda-open-slot group w-full rounded-lg border border-dashed border-transparent p-1 text-sm text-muted-foreground transition-colors hover:border-primary hover:bg-blue-50 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40"
                                      disabled={
                                        busy ||
                                        agendaDate < shopDate() ||
                                        (agendaDate === shopDate() &&
                                          row.minute <= currentMinute)
                                      }
                                      onClick={() =>
                                        edit({
                                          kind: "new-appointment",
                                          date: agendaDate,
                                          time: row.time,
                                          barberId: cell.barberId,
                                        })
                                      }
                                      type="button"
                                    >
                                      <span
                                        aria-hidden="true"
                                        className="owner-agenda-open-slot-placeholder"
                                      >
                                        —
                                      </span>
                                      <span className="owner-agenda-open-slot-label items-center justify-center gap-1">
                                        <Plus aria-hidden="true" className="size-3" />
                                        Agendar
                                      </span>
                                    </button>
                                  ) : (
                                    <span className="text-sm text-muted-foreground">
                                      —
                                    </span>
                                  )}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {agendaLoading ? (
                    <p
                      role="status"
                      className="p-5 text-center text-sm text-muted-foreground"
                    >
                      Carregando agenda…
                    </p>
                  ) : !agendaRows.length ? (
                      <p className="p-5 text-center text-sm text-muted-foreground">
                        {agendaBarbers.length
                          ? "Não há horários configurados para esta data."
                          : "Nenhum profissional ativo cadastrado."}
                      </p>
                  ) : null}
                </Card>
                {appointments.length >= 500 && (
                  <p className="text-xs text-muted-foreground">
                    Exibindo até 500 registros. Filtre a agenda para revisar o
                    período.
                  </p>
                )}
              </TabsContent>
              <TabsContent value="servicos">
                <div className="owner-section-heading flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">
                    Catálogo de Serviços & Preços ({services.length})
                  </h2>
                  <Button
                    className={button}
                    disabled={busy || loading}
                    onClick={() => edit({ kind: "service" })}
                  >
                    <Plus className="size-4" />
                    Novo serviço
                  </Button>
                </div>
                <Card className="rounded-2xl bg-white py-0 shadow-sm">
                  <Table className="owner-mobile-table owner-services-table" role="table">
                    <TableHeader>
                      <TableRow>
                        {[
                          "Serviço",
                          "Categoria",
                          "Preço",
                          "Duração",
                          "Status",
                          "Ação",
                        ].map((text) => (
                          <TableHead key={text}>{text}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {services.map((item) => (
                        <TableRow key={item.id} role="row">
                          <TableCell role="cell" data-label="Serviço" className="owner-row-title min-w-52 font-semibold">
                            {item.name}
                          </TableCell>
                          <TableCell role="cell" data-label="Categoria">{item.category}</TableCell>
                          <TableCell role="cell" data-label="Preço" className="whitespace-nowrap">
                            {money(item.priceCents)}
                          </TableCell>
                          <TableCell role="cell" data-label="Duração">{item.durationMinutes} min</TableCell>
                          <TableCell role="cell" data-label="Status">
                            <Badge
                              className={`border-0 text-xs ${item.active ? "bg-blue-50 text-primary" : "bg-gray-100 text-gray-500"}`}
                            >
                              {item.active ? "Ativo" : "Inativo"}
                            </Badge>
                          </TableCell>
                          <TableCell role="cell" className="owner-row-actions">
                            <Button
                              variant="outline"
                              className={button}
                              disabled={busy}
                              onClick={() => edit({ kind: "service", item })}
                            >
                              Editar serviço
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {!services.length && !loading && (
                    <p className="p-5 text-center text-sm text-muted-foreground">
                      Nenhum serviço cadastrado.
                    </p>
                  )}
                </Card>
              </TabsContent>
            </Tabs>
        </>
        {editor && (
          <OwnerEditor
            key={`${editor.kind}-${"item" in editor ? (editor.item?.id ?? "new") : "bulk"}`}
            editor={editor}
            onClose={() => setEditor(null)}
            busy={busy}
            run={run}
            services={services}
            team={team}
            refresh={refresh}
            error={error}
          />
        )}
      </div>
    </div>
  );
}
function Metric({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <Card className="gap-2 rounded-2xl bg-white py-4 shadow-sm">
      <CardHeader className="px-4">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 px-4">
        <p className="break-words text-lg font-bold text-primary sm:text-xl">
          {value}
        </p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}
