import { scheduleTime, shopDate } from "./barber-schedule";
import type { Appointment } from "@/types";
export interface OwnerBarber {
  id: string;
  name: string;
  email: string;
  photo_url?: string;
  active: boolean;
  completed_count: number;
  revenue_cents: number;
  outstanding_cents: number;
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
export interface OwnerAgendaCell {
  barberId: string;
  inSchedule: boolean;
  appointments: Appointment[];
}
export interface OwnerAgendaRow {
  minute: number;
  time: string;
  cells: OwnerAgendaCell[];
}
export interface OwnerSummary {
  revenue_cents: number;
  total_count: number;
  completed_count: number;
  no_show_count: number;
  commission_cents: number;
  commission_pending_count: number;
  outstanding_cents: number;
  retained_cents: number;
  team: OwnerBarber[];
  rules: CommissionRule[];
  payments: { method: string; count: number; amount_cents: number }[];
  payouts: {
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
): OwnerAgendaRow[] {
  const barberIds = new Set(barbers.map((barber) => barber.id));
  const intervals = schedules.filter(
    (item) =>
      barberIds.has(item.barberId) &&
      item.startMinute >= 0 &&
      item.endMinute > item.startMinute,
  );
  const minutes = new Set<number>();
  const bookings = new Map<string, Appointment[]>();
  for (const interval of intervals) {
    for (
      let minute = interval.startMinute;
      minute < interval.endMinute;
      minute += 30
    ) {
      minutes.add(minute);
    }
  }
  for (const item of appointments) {
    if (
      item.status === "cancelled" ||
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
    bookings.set(key, [...(bookings.get(key) ?? []), item]);
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
        appointments: bookings.get(`${id}:${minute}`) ?? [],
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
