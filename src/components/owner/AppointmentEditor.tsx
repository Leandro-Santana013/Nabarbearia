import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import OwnerSelect from "./OwnerSelect";
import AppointmentCheckoutPanel, {
  useAppointmentCheckout,
  type CheckoutResult,
} from "@/components/checkout/AppointmentCheckoutPanel";
import { ApiError, api } from "@/services/api";
import type { Appointment, Service } from "@/types";
import {
  agendaStatusLabel,
  appointmentLocalDateTime,
  moveToDateTime,
  today,
  type OwnerBarber,
} from "@/lib/owner-dashboard";
import { money } from "@/lib/barber-schedule";

const section = "space-y-3 rounded-2xl border border-border/70 bg-white p-3 sm:p-4";
const heading = "text-xs font-semibold tracking-wide text-[#062d40] uppercase";
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(`${value}T12:00:00`));

/**
 * Edição e fechamento de um agendamento na Agenda Geral. A edição continua
 * usando api.editOwnerAppointment; o fechamento usa o painel compartilhado com
 * a agenda do barbeiro e só grava após a confirmação.
 */
export default function AppointmentEditor({
  appointment,
  services,
  team,
  busy,
  run,
  refresh,
  onClose,
  canCheckout,
  field,
}: {
  appointment: Appointment;
  services: Service[];
  team: OwnerBarber[];
  busy: boolean;
  run: (action: () => Promise<void>, message: string) => Promise<boolean>;
  refresh: () => Promise<void>;
  onClose: () => void;
  canCheckout: boolean;
  field: string;
}) {
  const initial = appointmentLocalDateTime(appointment.startsAt ?? appointment.date);
  const [serviceId, setServiceId] = useState(appointment.serviceId);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [barberId, setBarberId] = useState(appointment.barberId);
  const { checkout, error: checkoutError } = useAppointmentCheckout(appointment.id, canCheckout);

  const status = checkout?.status ?? appointment.status;
  const started = checkout?.executionStarted ?? appointment.executionStarted ?? false;
  const editable = status === "confirmed" && !started;
  const dirty =
    serviceId !== appointment.serviceId ||
    barberId !== appointment.barberId ||
    date !== initial.date ||
    time !== initial.time;
  const barberName =
    team.find((item) => item.id === appointment.barberId)?.name ?? appointment.barberName ?? "Profissional";

  const serviceOptions = services.filter((item) => item.active !== false);
  if (!serviceOptions.some((item) => item.id === appointment.serviceId)) {
    serviceOptions.push({
      id: appointment.serviceId,
      name: appointment.serviceName ?? "Serviço atual",
      description: "",
      category: "",
      priceCents: appointment.amountCents,
      durationMinutes: appointment.durationMinutes ?? 30,
      active: false,
    });
  }
  const barberOptions = team.filter((item) => item.active).map((item) => ({ value: item.id, label: item.name }));
  if (!barberOptions.some((item) => item.value === appointment.barberId)) {
    barberOptions.push({ value: appointment.barberId, label: appointment.barberName ?? "Profissional atual" });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editable) return;
    const saved = await run(async () => {
      await api.editOwnerAppointment(appointment.id, {
        service_id: serviceId,
        barber_user_id: barberId,
        starts_at: moveToDateTime(date, time),
      });
    }, "Alterações salvas.");
    if (saved) onClose();
  }

  async function confirmCheckout(input: Parameters<typeof api.completeAppointmentCheckout>[1]): Promise<CheckoutResult> {
    let code = "";
    let message = "";
    const done = await run(async () => {
      try {
        await api.completeAppointmentCheckout(appointment.id, input);
      } catch (failure) {
        code = failure instanceof ApiError ? failure.code : "";
        message = failure instanceof Error ? failure.message : "";
        throw failure;
      }
    }, "Atendimento concluído.");
    if (done) {
      onClose();
      return { ok: true };
    }
    // O painel de gestão já exibe o erro; preços desatualizados recarregam o catálogo,
    // o que limpa esse aviso, então o próprio painel de fechamento o mostra.
    const stale = code === "TOTAL_CHANGED" || code === "SERVICE_NOT_FOUND";
    return { ok: false, code, message: stale ? message : "" };
  }

  const actions = (
    <>
      <Button type="button" variant="outline" onClick={onClose} className="min-h-11 rounded-xl text-xs!">
        Voltar
      </Button>
      {editable && (
        <Button type="submit" variant={canCheckout ? "outline" : "default"} className="min-h-11 rounded-xl text-xs!">
          {busy ? "Salvando…" : "Salvar alterações"}
        </Button>
      )}
    </>
  );

  return (
    <form onSubmit={save} className="space-y-3">
      <fieldset disabled={busy} className="space-y-3">
        <section className={section} aria-labelledby="appointment-data">
          <h3 id="appointment-data" className={heading}>Dados do agendamento</h3>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:grid-cols-4">
            <div className="col-span-2 min-w-0">
              <dt className="text-xs text-muted-foreground">Cliente</dt>
              <dd className="font-semibold break-words">{appointment.clientName}</dd>
            </div>
            <div className="col-span-2 min-w-0">
              <dt className="text-xs text-muted-foreground">Status</dt>
              <dd className="font-semibold">{agendaStatusLabel({ status, executionStarted: started })}</dd>
            </div>
            {!editable && (
              <>
                <div><dt className="text-xs text-muted-foreground">Data</dt><dd>{formatDate(initial.date)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Horário</dt><dd>{initial.time}</dd></div>
                <div className="col-span-2 min-w-0"><dt className="text-xs text-muted-foreground">Barbeiro</dt><dd className="break-words">{barberName}</dd></div>
              </>
            )}
          </dl>
          {editable ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <OwnerSelect
                  label="Serviço agendado"
                  value={serviceId}
                  onChange={setServiceId}
                  options={serviceOptions.map((item) => ({
                    value: item.id,
                    label: `${item.name} · ${item.durationMinutes} min · ${money(item.priceCents)}`,
                  }))}
                />
              </div>
              <label className="block space-y-1 text-xs font-semibold">
                Data
                <Input required type="date" min={today()} value={date} onChange={(e) => setDate(e.target.value)} className={field} />
              </label>
              <label className="block space-y-1 text-xs font-semibold">
                Horário
                <Input required type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} />
              </label>
              <div className="sm:col-span-2">
                <OwnerSelect label="Barbeiro responsável" value={barberId} onChange={setBarberId} options={barberOptions} />
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {started && status === "confirmed"
                ? "Atendimento em andamento: serviço, data, horário e barbeiro não podem mais ser alterados."
                : "Somente agendamentos ainda não iniciados podem ter serviço, data, horário ou barbeiro alterados."}
            </p>
          )}
        </section>

        {canCheckout ? (
          <AppointmentCheckoutPanel
            checkout={checkout}
            loadError={checkoutError}
            catalog={services}
            busy={busy}
            confirmMode="review"
            blockedReason={dirty ? "Salve ou desfaça as alterações de serviço, data, horário ou barbeiro antes de concluir." : undefined}
            onConfirm={confirmCheckout}
            onCatalogStale={refresh}
            secondaryActions={actions}
          />
        ) : (
          <div className="owner-dialog-actions flex flex-wrap justify-end gap-2">{actions}</div>
        )}
      </fieldset>
    </form>
  );
}
