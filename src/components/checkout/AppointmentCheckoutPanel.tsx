import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/services/api";
import type { Service } from "@/types";
import {
  addExtraService,
  availableExtraServices,
  checkoutLines,
  checkoutTotal,
  paidPaymentLabel,
  paidPaymentMethods,
  removeExtraService,
  type AppointmentCheckout,
  type PaidPaymentMethod,
} from "@/lib/owner-dashboard";
import { money } from "@/lib/barber-schedule";

export interface CheckoutInput {
  extraServiceIds: string[];
  paymentMethod: PaidPaymentMethod;
  expectedTotalCents: number;
}
/** message vazia: o erro já foi exibido por quem chamou. */
export type CheckoutResult = { ok: true } | { ok: false; code?: string; message?: string };

/** Carrega serviços realizados, total e pagamento. Somente leitura: abrir não grava nada. */
export function useAppointmentCheckout(appointmentId: string, enabled = true) {
  const [checkout, setCheckout] = useState<AppointmentCheckout | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setCheckout(null);
    setError("");
    api.getAppointmentCheckout(appointmentId).then(
      (value) => { if (active) setCheckout(value); },
      (failure) => {
        if (active) setError(failure instanceof Error ? failure.message : "Não foi possível carregar os serviços.");
      },
    );
    return () => { active = false; };
  }, [appointmentId, enabled, revision]);
  return {
    checkout,
    error,
    /** Busca de novo no backend (ex.: depois de um conflito de versão). */
    reload: () => setRevision((value) => value + 1),
    /** Aplica o fechamento já devolvido pelo backend após uma correção. */
    replace: (value: AppointmentCheckout) => setCheckout(value),
  };
}

const section = "space-y-3 rounded-2xl border border-border/70 bg-white p-3 sm:p-4";
const heading = "text-xs font-semibold tracking-wide text-[#062d40] uppercase";
const field = "h-11 w-full rounded-xl border border-input bg-white px-3 text-base sm:text-sm";
const shopDateTime = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(value));

/**
 * Fechamento compartilhado pela Agenda Geral e pela agenda do barbeiro: mesmas
 * linhas, mesmo total, mesmas formas de pagamento e o mesmo endpoint. Só o
 * modo de confirmação muda:
 * - "review": a gestão clica em "Concluir atendimento" e confirma um resumo.
 * - "direct": o barbeiro confere o rodapé (total e pagamento) e confirma.
 */
export default function AppointmentCheckoutPanel({
  checkout,
  loadError,
  catalog,
  busy,
  confirmMode,
  blockedReason,
  onConfirm,
  onCatalogStale,
  secondaryActions,
  confirmTone = "primary",
}: {
  checkout: AppointmentCheckout | null;
  loadError: string;
  catalog: readonly Service[];
  busy: boolean;
  confirmMode: "review" | "direct";
  blockedReason?: string;
  onConfirm: (input: CheckoutInput) => Promise<CheckoutResult>;
  onCatalogStale?: () => Promise<void>;
  secondaryActions: ReactNode;
  confirmTone?: "primary" | "success";
}) {
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [extraChoice, setExtraChoice] = useState("");
  const [payment, setPayment] = useState<PaidPaymentMethod | "">("");
  const [confirming, setConfirming] = useState(false);
  const [localError, setLocalError] = useState("");

  const status = checkout?.status;
  const completed = status === "completed";
  const closable = checkout !== null && status === "confirmed";
  const original = checkout?.lines.find((line) => line.isOriginal) ?? checkout?.lines[0];
  const lines = !checkout ? [] : completed || !original ? checkout.lines : checkoutLines(original, extraIds, catalog);
  const total = completed && checkout ? checkout.totalCents : checkoutTotal(lines);
  const extraOptions = original ? availableExtraServices(catalog, original.serviceId, extraIds) : [];
  const editingLines = closable && !confirming;
  const confirmClass = confirmTone === "success"
    ? "min-h-11 rounded-xl bg-emerald-600 text-xs! font-semibold! text-white hover:bg-emerald-700"
    : "min-h-11 rounded-xl text-xs!";

  function addExtra() {
    if (!original || !extraChoice) return;
    setExtraIds((current) => addExtraService(current, extraChoice, original.serviceId));
    setExtraChoice("");
    setLocalError("");
  }

  /** Validação local antes de enviar; o backend recalcula e valida tudo de novo. */
  function validate(): PaidPaymentMethod | null {
    setLocalError("");
    if (!closable || !original) return null;
    if (blockedReason) {
      setLocalError(blockedReason);
      return null;
    }
    if (lines.length !== extraIds.length + 1) {
      setLocalError("Um serviço extra não está mais disponível no catálogo. Remova-o e tente novamente.");
      return null;
    }
    if (!payment) {
      setLocalError("Escolha a forma de pagamento para concluir o atendimento.");
      return null;
    }
    return payment;
  }

  async function submit(paymentMethod: PaidPaymentMethod) {
    const result = await onConfirm({ extraServiceIds: extraIds, paymentMethod, expectedTotalCents: total });
    if (result.ok) return;
    setConfirming(false);
    if (result.code === "TOTAL_CHANGED" || result.code === "SERVICE_NOT_FOUND") {
      // Recarrega o catálogo para exibir os preços atuais antes de nova confirmação.
      await onCatalogStale?.();
    }
    if (result.message) setLocalError(result.message);
  }

  if (loadError) return (
    <>
      <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{loadError}</p>
      <div className="flex flex-wrap justify-end gap-2">{secondaryActions}</div>
    </>
  );
  if (!checkout) return (
    <>
      <p role="status" className="text-xs text-muted-foreground">Carregando serviços…</p>
      <div className="flex flex-wrap justify-end gap-2">{secondaryActions}</div>
    </>
  );

  return (
    <div className="space-y-3">
      <section className={section} aria-labelledby="checkout-services">
        <h3 id="checkout-services" className={heading}>Serviços realizados</h3>
        <ul className="divide-y divide-border/70 rounded-xl border border-border/70">
          {lines.map((line) => (
            <li key={line.serviceId} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 break-words">
                {line.serviceName}
                <span className={`ml-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${line.isOriginal ? "bg-[#dff1fb] text-[#005a7a]" : "bg-slate-100 text-slate-600"}`}>
                  {line.isOriginal ? "Agendado" : "Adicional"}
                </span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{money(line.priceCents)}</span>
              {editingLines && !line.isOriginal && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  aria-label={`Remover ${line.serviceName}`}
                  onClick={() => setExtraIds((current) => removeExtraService(current, line.serviceId))}
                  className="size-9 shrink-0 rounded-lg text-muted-foreground hover:text-destructive"
                >
                  <X className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
        {completed && !checkout.recorded && (
          <p className="text-xs text-muted-foreground">Concluído sem fechamento detalhado: exibindo o serviço agendado.</p>
        )}
        {editingLines && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="block min-w-0 flex-1 space-y-1 text-xs font-semibold">
              Adicionar serviço realizado
              <select
                value={extraChoice}
                disabled={busy || !extraOptions.length}
                onChange={(event) => setExtraChoice(event.target.value)}
                className={field}
              >
                <option value="">{extraOptions.length ? "Selecione um serviço" : "Nenhum outro serviço disponível"}</option>
                {extraOptions.map((item) => (
                  <option key={item.id} value={item.id}>{item.name} · {money(item.priceCents)}</option>
                ))}
              </select>
            </label>
            <Button type="button" variant="outline" disabled={busy || !extraChoice} onClick={addExtra} className="min-h-11 rounded-xl text-xs!">
              <Plus className="size-4" />Adicionar
            </Button>
          </div>
        )}
      </section>

      {confirmMode === "review" || completed || !closable ? (
        <section className={section} aria-labelledby="checkout-total">
          <h3 id="checkout-total" className={heading}>Resumo financeiro</h3>
          <div className="flex items-baseline justify-between gap-3 rounded-xl bg-[#eef8fc] px-3 py-3">
            <span className="text-sm font-semibold">{completed ? "Valor final registrado" : "Valor total"}</span>
            <span className="text-xl font-bold text-primary tabular-nums" aria-live="polite">{money(total)}</span>
          </div>
        </section>
      ) : null}

      {(completed || closable) && (
        <section className={section} aria-labelledby="checkout-payment">
          <h3 id="checkout-payment" className={heading}>Pagamento</h3>
          {completed ? (
            <div className="space-y-1 text-sm">
              <p><span className="font-semibold">{paidPaymentLabel(checkout.paidPaymentMethod)}</span></p>
              {checkout.completedAt && <p className="text-xs text-muted-foreground">Concluído em {shopDateTime(checkout.completedAt)}</p>}
            </div>
          ) : (
            <div role="radiogroup" aria-label="Forma de pagamento" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {paidPaymentMethods.map((item) => (
                <label
                  key={item.value}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-input px-3 text-xs font-semibold has-[:checked]:border-primary has-[:checked]:bg-[#eef8fc] has-[:checked]:text-primary"
                >
                  <input
                    type="radio"
                    name="paid-payment-method"
                    value={item.value}
                    checked={payment === item.value}
                    disabled={busy || confirming}
                    onChange={() => { setPayment(item.value); setLocalError(""); }}
                  />
                  {item.label}
                </label>
              ))}
            </div>
          )}
        </section>
      )}

      {(status === "cancelled" || status === "no-show") && (
        <p className="rounded-xl bg-slate-50 p-3 text-xs text-muted-foreground">
          {status === "cancelled" ? "Atendimentos cancelados" : "Atendimentos marcados como falta"} não podem ser concluídos.
        </p>
      )}

      {localError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{localError}</p>}

      {confirming && (
        <section className="space-y-3 rounded-2xl border-2 border-primary/40 bg-[#f4faff] p-3 sm:p-4" aria-labelledby="checkout-confirm">
          <h3 id="checkout-confirm" className="text-sm font-semibold text-[#062d40]">Confirmar conclusão do atendimento</h3>
          <ul className="space-y-1 text-sm">
            {lines.map((line) => (
              <li key={line.serviceId} className="flex justify-between gap-3">
                <span className="min-w-0 break-words">{line.serviceName}</span>
                <span className="shrink-0 tabular-nums">{money(line.priceCents)}</span>
              </li>
            ))}
            <li className="flex justify-between gap-3 border-t border-border pt-1 font-bold">
              <span>Total</span><span className="tabular-nums">{money(total)}</span>
            </li>
          </ul>
          <p className="text-xs text-muted-foreground">
            Pagamento: <strong>{paidPaymentLabel(payment)}</strong>. O atendimento será marcado como concluído e o valor entrará no financeiro.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirming(false)} className="min-h-11 rounded-xl text-xs!">Revisar</Button>
            <Button type="button" disabled={busy} onClick={() => { if (payment) void submit(payment); }} className={confirmClass}>
              <CheckCircle2 className="size-4" />{busy ? "Concluindo…" : "Confirmar conclusão"}
            </Button>
          </div>
        </section>
      )}

      {!confirming && confirmMode === "direct" && closable ? (
        <div className="sticky bottom-0 space-y-3 rounded-2xl border border-border/70 bg-white p-3 shadow-[0_-6px_16px_rgba(6,45,64,0.06)]">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold">Valor total</span>
            <span className="text-xl font-bold text-primary tabular-nums" aria-live="polite">{money(total)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Pagamento: <strong className={payment ? "text-foreground" : "text-amber-700"}>{payment ? paidPaymentLabel(payment) : "não selecionado"}</strong>
          </p>
          <div className="grid grid-cols-2 gap-2">
            {secondaryActions}
            <Button
              type="button"
              disabled={busy}
              onClick={() => { const method = validate(); if (method) void submit(method); }}
              className={confirmClass}
            >
              <CheckCircle2 className="size-4" />{busy ? "Concluindo…" : "Confirmar conclusão"}
            </Button>
          </div>
        </div>
      ) : !confirming ? (
        <div className="flex flex-wrap justify-end gap-2">
          {secondaryActions}
          {closable && confirmMode === "review" && (
            <Button type="button" disabled={busy} onClick={() => { if (validate()) setConfirming(true); }} className={confirmClass}>
              <CheckCircle2 className="size-4" />Concluir atendimento
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
