import { scheduleTime, shopDate } from "./barber-schedule";
import type { Appointment, Service } from "@/types";
export interface OwnerBarber {
  id: string;
  name: string;
  email: string;
  photo_url?: string;
  active: boolean;
  completed_count: number;
  revenue_cents?: number;
  outstanding_cents?: number;
}
export interface CommissionRule {
  id: string;
  barber_id: string | null;
  service_id: string | null;
  rule_type: "percent" | "fixed";
  amount: number;
  valid_from?: string;
  valid_until?: string;
}
export interface OwnerScheduleInterval {
  barberId: string;
  startMinute: number;
  endMinute: number;
}
export interface OwnerRecurringBlock {
  barberId: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
}
export interface OwnerAvailabilityBlock {
  id: string;
  barberId: string;
  barberName: string;
  startsAt: string;
  endsAt: string;
  reason?: string;
  blockType: string;
}
export interface OwnerAgendaCell {
  barberId: string;
  inSchedule: boolean;
  recurringBlocked: boolean;
  availabilityBlocks: OwnerAvailabilityBlock[];
  /** Atendimentos que ocupam o horário (todos, exceto cancelados). */
  appointments: Appointment[];
  /** Cancelados ficam visíveis, mas não ocupam o horário nem bloqueiam novos agendamentos. */
  cancelledAppointments: Appointment[];
}
/**
 * Apresentação da agenda derivada dos dados reais: "Em atendimento" não é um
 * status do backend, e sim um agendamento confirmado com execução iniciada.
 */
export type AgendaStatusKey =
  | "scheduled"
  | "in-progress"
  | "completed"
  | "cancelled"
  | "no-show";
export const agendaStatusLegend: readonly { key: AgendaStatusKey; label: string }[] = [
  { key: "scheduled", label: "Agendado" },
  { key: "in-progress", label: "Em atendimento" },
  { key: "completed", label: "Concluído" },
  { key: "cancelled", label: "Cancelado" },
  { key: "no-show", label: "Falta" },
];
export function agendaStatus(
  item: Pick<Appointment, "status" | "executionStarted">,
): AgendaStatusKey {
  if (item.status === "confirmed") {
    return item.executionStarted ? "in-progress" : "scheduled";
  }
  return item.status;
}
export function agendaStatusLabel(
  item: Pick<Appointment, "status" | "executionStarted">,
): string {
  const key = agendaStatus(item);
  return agendaStatusLegend.find((entry) => entry.key === key)?.label ?? key;
}
export interface OwnerAgendaRow {
  minute: number;
  time: string;
  cells: OwnerAgendaCell[];
}
export interface OwnerSummary {
  commission_paid_cents?: number;
  commission_unpaid_cents?: number;
  /** Concluídos sem pagamento registrado, agrupados pelo pagamento previsto. */
  planned_payments?: { method: string; count: number; amount_cents: number }[];
  revenue_cents?: number;
  total_count: number;
  completed_count: number;
  no_show_count: number;
  commission_cents?: number;
  commission_pending_count?: number;
  outstanding_cents?: number;
  retained_cents?: number;
  team: OwnerBarber[];
  rules?: CommissionRule[];
  payments?: { method: string; count: number; amount_cents: number }[];
  payouts?: {
    id: string;
    barber_name: string;
    amount_cents: number;
    created_at: string;
  }[];
}
export function ownerAgendaRows(
  appointments: Appointment[],
  schedules: OwnerScheduleInterval[],
  barbers: readonly { id: string }[],
  date: string,
  recurringBlocks: readonly OwnerRecurringBlock[] = [],
  availabilityBlocks: readonly OwnerAvailabilityBlock[] = [],
): OwnerAgendaRow[] {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const barberIds = new Set(barbers.map((barber) => barber.id));
  const intervals = schedules.filter(
    (item) =>
      barberIds.has(item.barberId) &&
      item.startMinute >= 0 &&
      item.endMinute > item.startMinute,
  );
  const minutes = new Set<number>();
  const bookings = new Map<string, Appointment[]>();
  const cancelled = new Map<string, Appointment[]>();
  for (const interval of intervals) {
    for (
      let minute = interval.startMinute;
      minute < interval.endMinute;
      minute += 30
    ) {
      minutes.add(minute);
    }
  }
  const blocks = recurringBlocks.filter((item) => barberIds.has(item.barberId) && item.weekday === weekday);
  for (const item of appointments) {
    if (
      !barberIds.has(item.barberId) ||
      shopDate(new Date(item.startsAt ?? item.date)) !== date
    ) {
      continue;
    }
    const time = scheduleTime(item.startsAt ?? item.date);
    const [hour, minute] = time.split(":").map(Number);
    const startsAtMinute = hour * 60 + minute;
    minutes.add(startsAtMinute);
    const key = `${item.barberId}:${startsAtMinute}`;
    const target = item.status === "cancelled" ? cancelled : bookings;
    target.set(key, [...(target.get(key) ?? []), item]);
  }
  return [...minutes]
    .sort((a, b) => a - b)
    .map((minute) => ({
      minute,
      time: `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(
        minute % 60,
      ).padStart(2, "0")}`,
      cells: barbers.map(({ id }) => ({
        barberId: id,
        inSchedule: intervals.some(
          (item) =>
            item.barberId === id &&
            item.startMinute <= minute &&
            item.endMinute > minute,
        ),
        recurringBlocked: blocks.some(
          (item) => item.barberId === id && item.startMinute <= minute && item.endMinute > minute,
        ),
        availabilityBlocks: availabilityBlocks.filter((block) => {
          if (block.barberId !== id) return false;
          const blockDate = shopDate(new Date(block.startsAt));
          const endDate = shopDate(new Date(block.endsAt));
          if (blockDate > date || endDate < date) return false;
          const [startHour, startMinute] = scheduleTime(block.startsAt).split(":").map(Number);
          const [endHour, endMinute] = scheduleTime(block.endsAt).split(":").map(Number);
          const start = blockDate < date ? 0 : startHour * 60 + startMinute;
          const end = endDate > date ? 1440 : endHour * 60 + endMinute;
          return start < minute + 30 && end > minute;
        }),
        appointments: bookings.get(`${id}:${minute}`) ?? [],
        cancelledAppointments: cancelled.get(`${id}:${minute}`) ?? [],
      })),
    }));
}
export function ownerRange(date: string, period: "day" | "month") {
  const from = new Date(
    `${period === "month" ? date.slice(0, 7) + "-01" : date}T00:00:00-03:00`,
  );
  const to = new Date(from);
  if (period === "month") to.setUTCMonth(to.getUTCMonth() + 1);
  else to.setUTCDate(to.getUTCDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}
export function appointmentLocalDateTime(startsAt: string) {
  const date = new Date(startsAt);
  return {
    date: shopDate(date),
    time: new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date),
  };
}
export function moveToDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00-03:00`).toISOString();
}
export function noShowRate(
  summary: Pick<OwnerSummary, "no_show_count" | "total_count">,
) {
  return summary.total_count
    ? Math.round((summary.no_show_count / summary.total_count) * 1000) / 10
    : 0;
}
export const today = shopDate;

/** Pagamento efetivamente recebido no fechamento (não é o "pagamento previsto"). */
export const paidPaymentMethods = [
  { value: "pix", label: "Pix" },
  { value: "cash", label: "Dinheiro" },
  { value: "debit_card", label: "Cartão de débito" },
  { value: "credit_card", label: "Cartão de crédito" },
] as const;
export type PaidPaymentMethod = (typeof paidPaymentMethods)[number]["value"];
export function paidPaymentLabel(value?: string | null): string {
  return paidPaymentMethods.find((item) => item.value === value)?.label ?? "Não registrado";
}
export interface CheckoutLine {
  serviceId: string;
  serviceName: string;
  priceCents: number;
  isOriginal: boolean;
}
export interface AppointmentCheckout {
  appointmentId: string;
  status: Appointment["status"];
  executionStarted: boolean;
  /** true quando as linhas vêm de um fechamento gravado. */
  recorded: boolean;
  lines: CheckoutLine[];
  totalCents: number;
  paidPaymentMethod?: PaidPaymentMethod;
  paidAt?: string;
  completedAt?: string;
  closedByName?: string;
  /** Versão lida ao abrir; a correção é recusada se outra pessoa alterou antes. */
  version: number;
  canCorrect: boolean;
  corrections: CorrectionRecord[];
}
export interface CorrectionServiceSnapshot {
  serviceId: string;
  serviceName: string;
  priceCents: number;
}
export interface CorrectionRecord {
  id: string;
  actorName: string;
  createdAt: string;
  reason: string;
  previousTotalCents: number;
  newTotalCents: number;
  previousPaymentMethod?: string;
  newPaymentMethod: string;
  previousServices: CorrectionServiceSnapshot[];
  newServices: CorrectionServiceSnapshot[];
  addedServices: CorrectionServiceSnapshot[];
  removedServices: CorrectionServiceSnapshot[];
  previousCommissionCents?: number;
  newCommissionCents?: number;
  commissionTreatment: "recalculated" | "adjustment" | "pending" | "unchanged";
}
/** Serviços ativos do catálogo que ainda não estão no atendimento. */
export function availableExtraServices(
  catalog: readonly Service[],
  originalServiceId: string,
  extraIds: readonly string[],
): Service[] {
  return catalog.filter(
    (item) =>
      item.active !== false &&
      item.id !== originalServiceId &&
      !extraIds.includes(item.id),
  );
}
/** Adiciona um extra sem permitir duplicidade nem repetir o serviço agendado. */
export function addExtraService(
  extraIds: readonly string[],
  serviceId: string,
  originalServiceId: string,
): string[] {
  if (!serviceId || serviceId === originalServiceId || extraIds.includes(serviceId)) {
    return [...extraIds];
  }
  return [...extraIds, serviceId];
}
export function removeExtraService(extraIds: readonly string[], serviceId: string): string[] {
  return extraIds.filter((id) => id !== serviceId);
}
/** Linhas exibidas antes do fechamento: o serviço agendado com o preço gravado e os extras pelo preço do catálogo. */
export function checkoutLines(
  original: CheckoutLine,
  extraIds: readonly string[],
  catalog: readonly Service[],
): CheckoutLine[] {
  const extras = extraIds.flatMap((id) => {
    const service = catalog.find((item) => item.id === id);
    return service
      ? [{ serviceId: service.id, serviceName: service.name, priceCents: service.priceCents, isOriginal: false }]
      : [];
  });
  return [original, ...extras];
}
export function checkoutTotal(lines: readonly CheckoutLine[]): number {
  return lines.reduce((total, line) => total + line.priceCents, 0);
}

/** "40", "40,5", "40,50" ou "R$ 1.234,56" → centavos; null quando inválido. */
export function parseMoneyInput(text: string): number | null {
  const clean = text.replace(/R\$|\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const cents = Math.round(Number(clean) * 100);
  return cents <= 100_000_000 ? cents : null;
}
export interface CorrectionDraftLine {
  serviceId: string;
  serviceName: string;
  priceCents: number;
}
/** Diferenças exibidas na confirmação de uma correção (antes × depois). */
export function correctionPreview(
  previous: readonly CorrectionDraftLine[],
  next: readonly CorrectionDraftLine[],
  previousPayment: string | undefined,
  nextPayment: string,
) {
  const before = new Map(previous.map((line) => [line.serviceId, line]));
  const after = new Map(next.map((line) => [line.serviceId, line]));
  const previousTotal = previous.reduce((total, line) => total + line.priceCents, 0);
  const newTotal = next.reduce((total, line) => total + line.priceCents, 0);
  const added = next.filter((line) => !before.has(line.serviceId));
  const removed = previous.filter((line) => !after.has(line.serviceId));
  const repriced = next.flatMap((line) => {
    const old = before.get(line.serviceId);
    return old && old.priceCents !== line.priceCents
      ? [{ serviceName: line.serviceName, previousCents: old.priceCents, newCents: line.priceCents }]
      : [];
  });
  const paymentChanged = (previousPayment ?? "") !== nextPayment;
  return {
    previousTotal,
    newTotal,
    added,
    removed,
    repriced,
    paymentChanged,
    changed: added.length > 0 || removed.length > 0 || repriced.length > 0 || paymentChanged,
  };
}
export const commissionTreatmentLabel: Record<CorrectionRecord["commissionTreatment"], string> = {
  recalculated: "Comissão recalculada (ainda não repassada)",
  adjustment: "Comissão já repassada: ajuste lançado para o próximo repasse",
  pending: "Comissão aguardando regra de comissão",
  unchanged: "Comissão sem alteração",
};

/* ---------- Filtros de período do Financeiro (fuso de Brasília) ---------- */

export type FinancePeriod = "day" | "month" | "custom";
export type QuickRange = "today" | "last7" | "last30" | "thisMonth" | "thisYear";
export const quickRanges: readonly { value: QuickRange; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "last7", label: "Últimos 7 dias" },
  { value: "last30", label: "Últimos 30 dias" },
  { value: "thisMonth", label: "Este mês" },
  { value: "thisYear", label: "Este ano" },
];
/** Maior intervalo aceito pelo backend (10 anos). */
export const MAX_RANGE_DAYS = 3660;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function isValidDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
/** Soma dias a uma data AAAA-MM-DD sem depender do fuso do navegador. */
export function addDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
const dayCount = (start: string, end: string) =>
  Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
export function formatDateBR(value: string): string {
  return value.split("-").reverse().join("/");
}
/** Intervalo [início do dia inicial, início do dia seguinte ao final) em Brasília: o último dia entra inteiro. */
export function customRange(start: string, end: string) {
  return {
    from: new Date(`${start}T00:00:00-03:00`).toISOString(),
    to: new Date(`${addDays(end, 1)}T00:00:00-03:00`).toISOString(),
  };
}
/** Datas inicial e final de um filtro rápido; `today` é a data de hoje em Brasília. */
export function quickRangeDates(range: QuickRange, today: string): { start: string; end: string } {
  switch (range) {
    case "today": return { start: today, end: today };
    case "last7": return { start: addDays(today, -6), end: today };
    case "last30": return { start: addDays(today, -29), end: today };
    case "thisMonth": return { start: `${today.slice(0, 7)}-01`, end: today };
    case "thisYear": return { start: `${today.slice(0, 4)}-01-01`, end: today };
  }
}
/** Mensagem de erro para um período personalizado, ou null quando válido. */
export function validateCustomRange(start: string, end: string): string | null {
  if (!start || !end) return "Informe a data inicial e a data final.";
  if (!isValidDate(start)) return "Data inicial inválida. Use o formato DD/MM/AAAA.";
  if (!isValidDate(end)) return "Data final inválida. Use o formato DD/MM/AAAA.";
  if (start > end) return "A data inicial não pode ser posterior à data final.";
  if (dayCount(start, end) > MAX_RANGE_DAYS) return "Selecione um período de até 10 anos.";
  return null;
}
/** Primeiro e último dia exibidos para Dia/Mês/Personalizado. */
export function periodBounds(period: FinancePeriod, reportDate: string, custom: { start: string; end: string }) {
  if (period === "day") return { start: reportDate, end: reportDate };
  if (period === "month") {
    const first = `${reportDate.slice(0, 7)}-01`;
    const [year, month] = first.split("-").map(Number);
    return { start: first, end: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10) };
  }
  return custom;
}
export function periodRangeLabel(start: string, end: string): string {
  return start === end ? `Período: ${formatDateBR(start)}` : `Período: ${formatDateBR(start)} a ${formatDateBR(end)}`;
}
/** Rótulos do pagamento efetivamente registrado no resumo financeiro. */
export const paidSummaryRows: readonly { method: string; label: string }[] = [
  { method: "pix", label: "Pix" },
  { method: "cash", label: "Dinheiro" },
  { method: "debit_card", label: "Cartão de débito" },
  { method: "credit_card", label: "Cartão de crédito" },
  { method: "not_recorded", label: "Sem pagamento registrado" },
];
