import { useState } from "react";
import { History, PencilLine, Plus, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppointmentCheckout } from "@/components/checkout/AppointmentCheckoutPanel";
import { ApiError, api } from "@/services/api";
import type { Appointment, Service } from "@/types";
import {
  agendaStatusLabel,
  appointmentLocalDateTime,
  commissionTreatmentLabel,
  correctionPreview,
  paidPaymentLabel,
  paidPaymentMethods,
  parseMoneyInput,
  type AppointmentCheckout,
  type CorrectionDraftLine,
  type OwnerBarber,
  type PaidPaymentMethod,
} from "@/lib/owner-dashboard";
import { money } from "@/lib/barber-schedule";

const section = "space-y-3 rounded-2xl border border-border/70 bg-white p-3 sm:p-4";
const heading = "flex items-center gap-1.5 text-xs font-semibold tracking-wide text-[#062d40] uppercase";
const field = "h-11 w-full rounded-xl border border-input bg-white px-3 text-base sm:text-sm";
const shopDateTime = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(value));

interface DraftLine extends CorrectionDraftLine {
  priceText: string;
}

function draftFrom(checkout: AppointmentCheckout): DraftLine[] {
  return checkout.lines.map((line) => ({
    serviceId: line.serviceId,
    serviceName: line.serviceName,
    priceCents: line.priceCents,
    priceText: (line.priceCents / 100).toFixed(2).replace(".", ","),
  }));
}

/**
 * Revisão administrativa de um atendimento concluído. O modo de visualização
 * não grava nada; a correção (somente superadministrador) exige motivo e uma
 * confirmação com os valores anteriores e novos.
 */
export default function ClosingDetails({
  appointment,
  services,
  team,
  busy,
  run,
  onClose,
}: {
  appointment: Appointment;
  services: Service[];
  team: OwnerBarber[];
  busy: boolean;
  run: (action: () => Promise<void>, message: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const { checkout, error, reload, replace } = useAppointmentCheckout(appointment.id);
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [payment, setPayment] = useState<PaidPaymentMethod | "">("");
  const [reason, setReason] = useState("");
  const [extraChoice, setExtraChoice] = useState("");
  const [localError, setLocalError] = useState("");

  const scheduled = appointmentLocalDateTime(appointment.startsAt ?? appointment.date);
  const barberName = team.find((item) => item.id === appointment.barberId)?.name ?? appointment.barberName ?? "Profissional";
  const preview = checkout && payment
    ? correctionPreview(checkout.lines, draft, checkout.paidPaymentMethod, payment)
    : null;
  const draftTotal = draft.reduce((total, line) => total + line.priceCents, 0);
  const extraOptions = services.filter(
    (item) => item.active !== false && !draft.some((line) => line.serviceId === item.id),
  );
  const originalTotal = checkout?.corrections.length
    ? checkout.corrections[checkout.corrections.length - 1].previousTotalCents
    : undefined;

  function startCorrection() {
    if (!checkout) return;
    setDraft(draftFrom(checkout));
    setPayment(checkout.paidPaymentMethod ?? "");
    setReason("");
    setLocalError("");
    setMode("edit");
  }

  function updatePrice(serviceId: string, text: string) {
    setDraft((lines) => lines.map((line) => {
      if (line.serviceId !== serviceId) return line;
      const cents = parseMoneyInput(text);
      return { ...line, priceText: text, priceCents: cents ?? line.priceCents };
    }));
  }

  function addService() {
    const service = services.find((item) => item.id === extraChoice);
    if (!service || draft.some((line) => line.serviceId === service.id)) return;
    setDraft((lines) => [...lines, {
      serviceId: service.id,
      serviceName: service.name,
      priceCents: service.priceCents,
      priceText: (service.priceCents / 100).toFixed(2).replace(".", ","),
    }]);
    setExtraChoice("");
  }

  function review() {
    setLocalError("");
    if (!draft.length) return setLocalError("Mantenha pelo menos um serviço realizado.");
    if (draft.some((line) => parseMoneyInput(line.priceText) === null)) return setLocalError("Informe valores válidos, por exemplo 40,00.");
    if (!payment) return setLocalError("Escolha a forma de pagamento efetivamente usada.");
    if (reason.trim().length < 5) return setLocalError("Informe o motivo da alteração (mínimo de 5 caracteres).");
    if (!preview?.changed) return setLocalError("Nenhuma alteração foi feita em serviços, valores ou pagamento.");
    setMode("confirm");
  }

  async function save() {
    if (!checkout || !payment) return;
    let code = "";
    let message = "";
    const result: { updated: AppointmentCheckout | null } = { updated: null };
    const saved = await run(async () => {
      try {
        result.updated = await api.correctAppointmentClosing(appointment.id, {
          lines: draft.map((line) => ({ serviceId: line.serviceId, priceCents: line.priceCents })),
          paymentMethod: payment,
          reason: reason.trim(),
          expectedVersion: checkout.version,
        });
      } catch (failure) {
        code = failure instanceof ApiError ? failure.code : "";
        message = failure instanceof Error ? failure.message : "Não foi possível salvar a correção.";
        throw failure;
      }
    }, "Correção registrada no histórico.");
    if (saved && result.updated) {
      replace(result.updated);
      setMode("view");
      return;
    }
    setMode("edit");
    setLocalError(message);
    if (code === "APPOINTMENT_CHANGED") {
      // Outra correção foi salva antes: recarrega e volta à visualização para revisar.
      reload();
      setMode("view");
    }
  }

  if (error) return (
    <div className="space-y-3">
      <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>
      <div className="flex justify-end"><Button type="button" variant="outline" onClick={onClose} className="min-h-11 rounded-xl text-xs!">Fechar</Button></div>
    </div>
  );
  if (!checkout) return <p role="status" className="text-xs text-muted-foreground">Carregando atendimento…</p>;

  const editing = mode !== "view";
  return (
    <fieldset disabled={busy} className="min-w-0 space-y-3">
      {editing && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span><strong>Modo de correção.</strong> Nada é gravado até a confirmação. A correção fica registrada no histórico com o seu nome e o motivo.</span>
        </p>
      )}

      <section className={section} aria-labelledby="closing-general">
        <h3 id="closing-general" className={heading}>Informações gerais</h3>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:grid-cols-3">
          <div className="col-span-2 min-w-0 sm:col-span-1"><dt className="text-xs text-muted-foreground">Cliente</dt><dd className="font-semibold break-words">{appointment.clientName}</dd></div>
          <div className="min-w-0"><dt className="text-xs text-muted-foreground">Barbeiro responsável</dt><dd className="break-words">{barberName}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Status</dt><dd className="font-semibold">{agendaStatusLabel({ status: checkout.status, executionStarted: checkout.executionStarted })}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Agendamento</dt><dd>{scheduled.date.split("-").reverse().join("/")} às {scheduled.time}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Conclusão</dt><dd>{checkout.completedAt ? shopDateTime(checkout.completedAt) : "Não registrada"}</dd></div>
          <div className="min-w-0"><dt className="text-xs text-muted-foreground">Fechamento por</dt><dd className="break-words">{checkout.closedByName ?? "Não registrado"}</dd></div>
        </dl>
      </section>

      <section className={section} aria-labelledby="closing-services">
        <h3 id="closing-services" className={heading}>Serviços realizados</h3>
        {!editing ? (
          <ul className="divide-y divide-border/70 rounded-xl border border-border/70">
            {checkout.lines.map((line) => (
              <li key={line.serviceId} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 break-words">
                  {line.serviceName}
                  <span className={`ml-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${line.isOriginal ? "bg-[#dff1fb] text-[#005a7a]" : "bg-slate-100 text-slate-600"}`}>
                    {line.isOriginal ? "Agendado" : "Adicional"}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{money(line.priceCents)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <ul className="space-y-2">
              {draft.map((line) => (
                <li key={line.serviceId} className="flex items-end gap-2 rounded-xl border border-border/70 p-2">
                  <span className="min-w-0 flex-1 self-center text-sm break-words">{line.serviceName}</span>
                  <label className="w-28 shrink-0 space-y-1 text-[11px] font-semibold text-muted-foreground">
                    Valor (R$)
                    <Input
                      inputMode="decimal"
                      value={line.priceText}
                      disabled={mode === "confirm"}
                      aria-invalid={parseMoneyInput(line.priceText) === null}
                      onChange={(event) => updatePrice(line.serviceId, event.target.value)}
                      className="h-10 rounded-lg bg-white text-right text-sm! tabular-nums"
                    />
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={mode === "confirm" || draft.length === 1}
                    aria-label={`Remover ${line.serviceName}`}
                    onClick={() => setDraft((lines) => lines.filter((item) => item.serviceId !== line.serviceId))}
                    className="size-10 shrink-0 rounded-lg text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
            {mode === "edit" && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="block min-w-0 flex-1 space-y-1 text-xs font-semibold">
                  Adicionar serviço
                  <select value={extraChoice} disabled={!extraOptions.length} onChange={(event) => setExtraChoice(event.target.value)} className={field}>
                    <option value="">{extraOptions.length ? "Selecione um serviço" : "Nenhum outro serviço disponível"}</option>
                    {extraOptions.map((item) => <option key={item.id} value={item.id}>{item.name} · {money(item.priceCents)}</option>)}
                  </select>
                </label>
                <Button type="button" variant="outline" disabled={!extraChoice} onClick={addService} className="min-h-11 rounded-xl text-xs!"><Plus className="size-4" />Adicionar</Button>
              </div>
            )}
          </>
        )}
      </section>

      <section className={section} aria-labelledby="closing-total">
        <h3 id="closing-total" className={heading}>Resumo financeiro</h3>
        <div className="flex items-baseline justify-between gap-3 rounded-xl bg-[#eef8fc] px-3 py-3">
          <span className="text-sm font-semibold">{editing ? "Novo valor total" : "Valor total cobrado"}</span>
          <span className="text-xl font-bold text-primary tabular-nums" aria-live="polite">{money(editing ? draftTotal : checkout.totalCents)}</span>
        </div>
        {editing && <p className="text-xs text-muted-foreground">Valor registrado hoje: {money(checkout.totalCents)}</p>}
        {!editing && originalTotal !== undefined && originalTotal !== checkout.totalCents && (
          <p className="text-xs text-muted-foreground">Valor do fechamento original: {money(originalTotal)} · corrigido pela gestão.</p>
        )}
      </section>

      <section className={section} aria-labelledby="closing-payment">
        <h3 id="closing-payment" className={heading}>Pagamento</h3>
        {!editing ? (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-muted-foreground">Forma registrada</dt><dd className="font-semibold">{paidPaymentLabel(checkout.paidPaymentMethod)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Valor total pago</dt><dd className="font-semibold tabular-nums">{checkout.paidPaymentMethod ? money(checkout.totalCents) : "—"}</dd></div>
            <div className="col-span-2 sm:col-span-1"><dt className="text-xs text-muted-foreground">Situação</dt><dd>{checkout.paidPaymentMethod ? "Pagamento recebido" : "Sem pagamento registrado no fechamento"}</dd></div>
          </dl>
        ) : (
          <div role="radiogroup" aria-label="Forma de pagamento" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {paidPaymentMethods.map((item) => (
              <label key={item.value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-input px-3 text-xs font-semibold has-[:checked]:border-primary has-[:checked]:bg-[#eef8fc] has-[:checked]:text-primary">
                <input type="radio" name="correction-payment" value={item.value} checked={payment === item.value} disabled={mode === "confirm"} onChange={() => setPayment(item.value)} />
                {item.label}
              </label>
            ))}
          </div>
        )}
        {!editing && appointment.paymentMethod && (
          <p className="text-[11px] text-muted-foreground">Pagamento previsto no agendamento: {appointment.paymentMethod} (não é o pagamento realizado).</p>
        )}
      </section>

      {editing && (
        <label className="block space-y-1 text-xs font-semibold">
          Motivo da alteração (obrigatório)
          <textarea
            required
            minLength={5}
            maxLength={500}
            rows={2}
            value={reason}
            disabled={mode === "confirm"}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ex.: sobrancelha registrada por engano"
            className="w-full rounded-xl border border-input bg-white px-3 py-2 text-base sm:text-sm"
          />
        </label>
      )}

      {mode === "confirm" && preview && (
        <section className="space-y-2 rounded-2xl border-2 border-amber-400 bg-amber-50/60 p-3 sm:p-4" aria-labelledby="closing-confirm">
          <h3 id="closing-confirm" className="text-sm font-semibold text-[#062d40]">Confirme a correção</h3>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 font-medium"></th><th className="py-1 font-medium">Antes</th><th className="py-1 font-medium">Depois</th></tr></thead>
            <tbody>
              <tr><th scope="row" className="py-1 pr-2 text-left font-medium">Total</th><td className="tabular-nums">{money(preview.previousTotal)}</td><td className="font-bold tabular-nums">{money(preview.newTotal)}</td></tr>
              <tr><th scope="row" className="py-1 pr-2 text-left font-medium">Pagamento</th><td>{paidPaymentLabel(checkout.paidPaymentMethod)}</td><td className="font-semibold">{paidPaymentLabel(payment)}</td></tr>
            </tbody>
          </table>
          <ul className="space-y-1 text-xs">
            {preview.added.map((line) => <li key={`a-${line.serviceId}`} className="text-emerald-700">+ {line.serviceName} ({money(line.priceCents)})</li>)}
            {preview.removed.map((line) => <li key={`r-${line.serviceId}`} className="text-red-700">− {line.serviceName} ({money(line.priceCents)})</li>)}
            {preview.repriced.map((line) => <li key={`p-${line.serviceName}`}>{line.serviceName}: {money(line.previousCents)} → {money(line.newCents)}</li>)}
          </ul>
          <p className="text-xs"><span className="text-muted-foreground">Motivo:</span> {reason.trim()}</p>
          <p className="text-[11px] text-muted-foreground">A receita do atendimento passa a ser o novo total. Se a comissão já foi repassada, a diferença entra como ajuste no próximo repasse.</p>
        </section>
      )}

      {localError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{localError}</p>}

      {!editing && (
        <section className={section} aria-labelledby="closing-history">
          <h3 id="closing-history" className={heading}><History aria-hidden="true" className="size-3.5" />Histórico de alterações</h3>
          {!checkout.corrections.length ? (
            <p className="text-xs text-muted-foreground">Nenhuma correção registrada.</p>
          ) : (
            <ol className="space-y-2">
              {checkout.corrections.map((item) => (
                <li key={item.id} className="space-y-1 rounded-xl bg-slate-50 p-3 text-xs">
                  <p className="font-semibold">{shopDateTime(item.createdAt)} · {item.actorName}</p>
                  <p><span className="text-muted-foreground">Motivo:</span> {item.reason}</p>
                  <p>Total: {money(item.previousTotalCents)} → <strong>{money(item.newTotalCents)}</strong> · Pagamento: {paidPaymentLabel(item.previousPaymentMethod)} → <strong>{paidPaymentLabel(item.newPaymentMethod)}</strong></p>
                  {item.addedServices.length > 0 && <p className="text-emerald-700">Adicionados: {item.addedServices.map((line) => `${line.serviceName} (${money(line.priceCents)})`).join(", ")}</p>}
                  {item.removedServices.length > 0 && <p className="text-red-700">Removidos: {item.removedServices.map((line) => `${line.serviceName} (${money(line.priceCents)})`).join(", ")}</p>}
                  <p className="text-muted-foreground">
                    {commissionTreatmentLabel[item.commissionTreatment]}
                    {item.previousCommissionCents !== undefined || item.newCommissionCents !== undefined
                      ? ` · ${item.previousCommissionCents === undefined ? "—" : money(item.previousCommissionCents)} → ${item.newCommissionCents === undefined ? "—" : money(item.newCommissionCents)}`
                      : ""}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      <div className="owner-dialog-actions flex flex-wrap justify-end gap-2">
        {mode === "view" && <>
          <Button type="button" variant="outline" onClick={onClose} className="min-h-11 rounded-xl text-xs!">Fechar</Button>
          {checkout.canCorrect && (
            <Button type="button" onClick={startCorrection} className="min-h-11 rounded-xl bg-amber-600 text-xs! text-white hover:bg-amber-700">
              <PencilLine className="size-4" />Corrigir atendimento
            </Button>
          )}
        </>}
        {mode === "edit" && <>
          <Button type="button" variant="outline" onClick={() => { setMode("view"); setLocalError(""); }} className="min-h-11 rounded-xl text-xs!">Cancelar correção</Button>
          <Button type="button" onClick={review} className="min-h-11 rounded-xl text-xs!">Revisar correção</Button>
        </>}
        {mode === "confirm" && <>
          <Button type="button" variant="outline" onClick={() => setMode("edit")} className="min-h-11 rounded-xl text-xs!">Voltar e ajustar</Button>
          <Button type="button" onClick={() => void save()} className="min-h-11 rounded-xl bg-amber-600 text-xs! text-white hover:bg-amber-700">{busy ? "Salvando…" : "Salvar correção"}</Button>
        </>}
      </div>
    </fieldset>
  );
}
