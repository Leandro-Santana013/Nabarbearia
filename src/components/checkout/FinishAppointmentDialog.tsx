import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import AppointmentCheckoutPanel, {
  useAppointmentCheckout,
  type CheckoutInput,
  type CheckoutResult,
} from "./AppointmentCheckoutPanel";
import { api } from "@/services/api";
import type { Appointment, Service } from "@/types";
import { scheduleTime } from "@/lib/barber-schedule";

/**
 * Modal da agenda individual. Enquanto estiver aberto o atendimento continua
 * "Em atendimento"; fechar ou cancelar não envia nada ao backend. Atendimentos
 * concluídos abrem em modo somente leitura.
 */
export default function FinishAppointmentDialog({
  appointment,
  barberName,
  busy,
  onConfirm,
  onClose,
}: {
  appointment: Appointment;
  barberName: string;
  busy: boolean;
  onConfirm: (input: CheckoutInput) => Promise<CheckoutResult>;
  onClose: () => void;
}) {
  const { checkout, error } = useAppointmentCheckout(appointment.id);
  const [catalog, setCatalog] = useState<Service[]>([]);
  const [catalogError, setCatalogError] = useState("");
  const loadCatalog = useCallback(async () => {
    try {
      setCatalog((await api.getPublicServices()).filter((item) => item.active !== false));
      setCatalogError("");
    } catch (failure) {
      setCatalogError(failure instanceof Error ? failure.message : "Não foi possível carregar o catálogo de serviços.");
    }
  }, []);
  useEffect(() => { void loadCatalog(); }, [loadCatalog]);

  const completed = checkout?.status === "completed";
  const close = (
    <Button type="button" variant="outline" disabled={busy} onClick={onClose} className="min-h-11 rounded-xl text-xs!">
      {completed || (checkout && checkout.status !== "confirmed") ? "Fechar" : "Cancelar"}
    </Button>
  );

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="barber-finish-dialog sm:max-w-xl">
        <DialogTitle className="pr-8 text-lg font-semibold">
          {completed ? "Atendimento concluído" : "Finalizar atendimento"}
        </DialogTitle>
        <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
          {completed
            ? "Consulta dos serviços realizados e do pagamento registrado."
            : "Confira os serviços realizados, adicione o que foi feito a mais e escolha como o cliente pagou."}
        </DialogDescription>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-2xl bg-slate-50 p-3 text-sm">
          <div className="col-span-2 min-w-0">
            <dt className="text-xs text-muted-foreground">Cliente</dt>
            <dd className="font-semibold break-words">{appointment.clientName}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Barbeiro</dt>
            <dd className="break-words">{appointment.barberName ?? barberName}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Horário agendado</dt>
            <dd>{scheduleTime(appointment.startsAt ?? appointment.date)}</dd>
          </div>
        </dl>
        {catalogError && !completed && (
          <p role="alert" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">{catalogError} Ainda é possível concluir só com o serviço agendado.</p>
        )}
        <fieldset disabled={busy} className="min-w-0">
          <AppointmentCheckoutPanel
            checkout={checkout}
            loadError={error}
            catalog={catalog}
            busy={busy}
            confirmMode="direct"
            confirmTone="success"
            onConfirm={onConfirm}
            onCatalogStale={loadCatalog}
            secondaryActions={close}
          />
        </fieldset>
      </DialogContent>
    </Dialog>
  );
}
