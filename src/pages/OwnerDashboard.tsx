import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./owner-mobile.css";
import {
  ArrowRightLeft,
  Calendar,
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
import { useAndroidReady } from "@/lib/android-startup";
import BarberDashboard from "./BarberDashboard";
import { api, type AuthResponse } from "@/services/api";
import { money, scheduleTime, shopDate } from "@/lib/barber-schedule";
import {
  noShowRate,
  ownerRange,
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
  const sequence = useRef(0);
  const agendaSequence = useRef(0);
  const pending = useRef(false);
  const allowed = session?.user.roles.includes("owner");
  const tab = sections.some((item) => path === `/gestao/${item.value}`)
    ? path.split("/").at(-1)!
    : "financeiro";
  const hybrid = path === "/gestao/minha-agenda";
  useAndroidReady(!hybrid && !loading && (tab !== "agenda-geral" || !agendaLoading));
  const range = useMemo(
    () => ownerRange(reportDate, period),
    [reportDate, period],
  );
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
    try {
      const data = await api.listAppointments(ownerRange(agendaDate, "day"));
      if (request === agendaSequence.current) setAppointments(data);
    } catch (failure) {
      if (request === agendaSequence.current) {
        setAppointments([]);
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
  function edit(value: Editor) {
    setError("");
    setNotice("");
    setEditor(value);
  }
  async function enterHybrid() {
    if (session?.user.roles.includes("barber")) {
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
  const visible = appointments
    .filter((item) => barberFilter === "all" || item.barberId === barberFilter)
    .sort((a, b) => (a.startsAt ?? a.date).localeCompare(b.startsAt ?? b.date));
  const eligible = visible.filter(
    (item) => item.status === "confirmed" && !item.executionStarted,
  );
  const chosen = eligible.filter((item) => selected.includes(item.id));
  const periodLabel = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    ...(period === "month"
      ? { month: "long", year: "numeric" }
      : { dateStyle: "long" }),
  }).format(new Date(`${reportDate}T12:00:00-03:00`));
  return (
    <div className="owner-dashboard min-h-dvh bg-background text-foreground">
      <div className="owner-container mx-auto max-w-6xl space-y-4 px-4 py-5 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]">
        <header className="owner-header flex flex-col justify-between gap-3 rounded-2xl border border-border/60 bg-white p-4 shadow-sm md:flex-row md:items-center">
          <div className="min-w-0">
            <Badge className="mb-1 rounded-full border-0 bg-blue-50 px-2.5 text-[10px] text-primary">
              Super Administrador
            </Badge>
            <h1 className="text-lg font-semibold">
              Painel de Gestão — NA Barbearia
            </h1>
            <p className="mt-1 break-words text-xs text-muted-foreground">
              {session.user.display_name}
            </p>
          </div>
          <div className="owner-header-actions flex flex-wrap gap-2">
            {hybrid ? (
              <Button
                variant="outline"
                className={button}
                onClick={() => onNavigate("/gestao/financeiro")}
              >
                <ArrowRightLeft className="size-4" />
                Voltar ao Painel Geral
              </Button>
            ) : session.user.roles.includes("barber") ? (
              <Button
                variant="outline"
                className={button}
                disabled={busy}
                onClick={() => void enterHybrid()}
              >
                <ArrowRightLeft className="size-4" />
                Modo Híbrido: Minha Agenda
              </Button>
            ) : (
              <Dialog open={hybridPrompt} onOpenChange={setHybridPrompt}>
                <DialogTrigger
                  render={<Button variant="outline" className={button} />}
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
                    acesso de proprietário. Configure seus horários em Equipe →
                    Escala para receber reservas.
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
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sair da gestão"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await logoutSession();
                }, "")
              }
              className="size-10 rounded-xl"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </header>
        {hybrid ? (
          <BarberDashboard session={session} />
        ) : (
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
                    transform: `translateX(calc(${sections.findIndex((section) => section.value === tab)} * (100% + 4px)))`,
                  }}
                />
                {sections.map(({ value, label, icon: Icon }) => (
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
              <TabsContent value="financeiro">
                <p className="text-xs capitalize text-muted-foreground">
                  {periodLabel}
                </p>
                <div className="owner-metrics grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Metric
                    label="Faturamento total"
                    value={summary ? money(summary.revenue_cents) : "—"}
                    description="Serviços concluídos no período"
                  />
                  <Metric
                    label="Comissões a pagar"
                    value={summary ? money(summary.outstanding_cents) : "—"}
                    description="Saldo acumulado ainda não repassado"
                  />
                  <Metric
                    label="Lucro líquido"
                    value="Não apurado"
                    description={
                      summary
                        ? `Após comissões: ${money(summary.retained_cents)}. Despesas e impostos não cadastrados.`
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
                            summary?.payments.filter(
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
                    {summary?.payouts.length ? (
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
              </TabsContent>
              <TabsContent value="barbeiros">
                <Card className="rounded-2xl bg-white shadow-sm">
                  <CardHeader className="owner-section-heading flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-sm font-semibold">
                        Equipe ({team.length} profissionais)
                      </CardTitle>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Produção no período selecionado. Saldo a pagar considera
                        todo o histórico.
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
                            "Faturamento",
                            "Comissão configurada",
                            "A repassar",
                            "Ações",
                          ].map((text) => (
                            <TableHead key={text}>{text}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {team.map((item) => {
                          const rules = summary!.rules.filter(
                            (rule) =>
                              rule.barber_id === item.id ||
                              rule.barber_id === null,
                          );
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
                              <TableCell role="cell" data-label="Faturamento" className="whitespace-nowrap">
                                {money(item.revenue_cents)}
                              </TableCell>
                              <TableCell role="cell" data-label="Comissão configurada" className="owner-row-wide">
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
                              </TableCell>
                              <TableCell role="cell" data-label="A repassar" className="owner-row-wide font-semibold whitespace-nowrap text-primary">
                                {money(item.outstanding_cents)}
                              </TableCell>
                              <TableCell role="cell" className="owner-row-actions">
                                <div className="flex min-w-52 flex-wrap gap-1.5">
                                  <Button
                                    variant="outline"
                                    className={button}
                                    onClick={() =>
                                      edit({ kind: "commission", item })
                                    }
                                  >
                                    Comissão
                                  </Button>
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
                                  <Button
                                    className={button}
                                    disabled={
                                      busy || item.outstanding_cents <= 0
                                    }
                                    onClick={() =>
                                      edit({ kind: "payout", item })
                                    }
                                  >
                                    Registrar repasse
                                  </Button>
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
                <div className="owner-bulk-actions flex flex-wrap items-center gap-2">
                  <span className="mr-auto text-xs text-muted-foreground">
                    {chosen.length} selecionado(s)
                  </span>
                  <Button
                    disabled={!chosen.length || busy}
                    variant="outline"
                    className={button}
                    onClick={() =>
                      edit({ kind: "bulk", action: "move", items: chosen })
                    }
                  >
                    Remanejar selecionados
                  </Button>
                  <Button
                    disabled={!chosen.length || busy}
                    variant="destructive"
                    className={button}
                    onClick={() =>
                      edit({ kind: "bulk", action: "cancel", items: chosen })
                    }
                  >
                    Cancelar selecionados
                  </Button>
                </div>
                <Card className="rounded-2xl bg-white py-0 shadow-sm">
                  <Table className="owner-mobile-table owner-agenda-table" role="table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          <input
                            type="checkbox"
                            aria-label="Selecionar todos os agendamentos elegíveis"
                            disabled={busy || !eligible.length}
                            checked={
                              eligible.length > 0 &&
                              chosen.length === eligible.length
                            }
                            onChange={(e) =>
                              setSelected(
                                e.target.checked
                                  ? eligible.map((item) => item.id)
                                  : [],
                              )
                            }
                          />
                        </TableHead>
                        {[
                          "Horário",
                          "Cliente / Serviço",
                          "Barbeiro",
                          "Status",
                        ].map((text) => (
                          <TableHead key={text}>{text}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.map((item) => (
                        <TableRow key={item.id} role="row">
                          <TableCell role="cell" className="owner-appointment-select">
                            <input
                              type="checkbox"
                              aria-label={`Selecionar agendamento de ${item.clientName} às ${scheduleTime(item.startsAt ?? item.date)}`}
                              disabled={
                                busy ||
                                item.status !== "confirmed" ||
                                item.executionStarted
                              }
                              checked={selected.includes(item.id)}
                              onChange={(e) =>
                                setSelected((old) =>
                                  e.target.checked
                                    ? [...old, item.id]
                                    : old.filter((id) => id !== item.id),
                                )
                              }
                            />
                          </TableCell>
                          <TableCell role="cell" data-label="Horário" className="owner-appointment-time whitespace-nowrap">
                            {scheduleTime(item.startsAt ?? item.date)}
                          </TableCell>
                          <TableCell role="cell" data-label="Cliente / Serviço" className="owner-appointment-client min-w-52">
                            <p className="text-sm font-semibold">
                              {item.clientName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {item.serviceName}
                            </p>
                            {item.clientNote && (
                              <p className="mt-1 text-[11px] text-amber-700">
                                Obs: {item.clientNote}
                              </p>
                            )}
                          </TableCell>
                          <TableCell role="cell" data-label="Barbeiro" className="owner-appointment-barber whitespace-nowrap">
                            {item.barberName}
                          </TableCell>
                          <TableCell role="cell" className="owner-appointment-status">
                            <Badge className="border-0 bg-blue-50 text-xs text-primary">
                              {item.status === "confirmed" &&
                              item.executionStarted
                                ? "Em atendimento"
                                : statusLabel[item.status]}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {agendaLoading ? (
                    <p
                      role="status"
                      className="p-5 text-center text-sm text-muted-foreground"
                    >
                      Carregando agenda…
                    </p>
                  ) : (
                    !visible.length && (
                      <p className="p-5 text-center text-sm text-muted-foreground">
                        Nenhum atendimento para esta seleção.
                      </p>
                    )
                  )}
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
        )}
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
