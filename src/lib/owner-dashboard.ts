import { shopDate } from "./barber-schedule";
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
export function ownerRange(date: string, period: "day" | "month") {
  const from = new Date(
    `${period === "month" ? date.slice(0, 7) + "-01" : date}T00:00:00-03:00`,
  );
  const to = new Date(from);
  if (period === "month") to.setUTCMonth(to.getUTCMonth() + 1);
  else to.setUTCDate(to.getUTCDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}
export function moveToDate(startsAt: string, date: string) {
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(startsAt));
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
