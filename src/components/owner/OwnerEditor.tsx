import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CommissionRuleForm from "@/components/CommissionRuleForm";
import OwnerSelect from "./OwnerSelect";
import { api } from "@/services/api";
import type { Appointment, Service } from "@/types";
import type { OwnerBarber } from "@/lib/owner-dashboard";
import { moveToDate, today } from "@/lib/owner-dashboard";
import { money } from "@/lib/barber-schedule";
export type Editor =
  | { kind: "service"; item?: Service }
  | { kind: "barber"; item?: OwnerBarber }
  | { kind: "commission"; item: OwnerBarber }
  | { kind: "schedule"; item: OwnerBarber }
  | { kind: "payout"; item: OwnerBarber }
  | { kind: "bulk"; action: "move" | "cancel"; items: Appointment[] };
export default function OwnerEditor({
  editor,
  onClose,
  busy,
  run,
  services,
  team,
  refresh,
  error,
}: {
  editor: Editor;
  onClose: () => void;
  busy: boolean;
  run: (action: () => Promise<void>, message: string) => Promise<boolean>;
  services: Service[];
  team: OwnerBarber[];
  refresh: () => Promise<void>;
  error: string;
}) {
  const service = editor.kind === "service" ? editor.item : undefined;
  const barber = editor.kind === "barber" ? editor.item : undefined;
  const [name, setName] = useState(service?.name ?? barber?.name ?? "");
  const [price, setPrice] = useState(
    service ? (service.priceCents / 100).toFixed(2) : "",
  );
  const [duration, setDuration] = useState(service?.durationMinutes ?? 30);
  const [description, setDescription] = useState(service?.description ?? "");
  const [category, setCategory] = useState(service?.category ?? "Cabelo");
  const [active, setActive] = useState(
    service?.active ?? barber?.active ?? true,
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [photo, setPhoto] = useState(barber?.photo_url ?? "");
  const [date, setDate] = useState(today());
  const [barberId, setBarberId] = useState("keep");
  const [weekday, setWeekday] = useState("1");
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("20:00");
  const key = useRef(crypto.randomUUID());
  const field = "h-11 rounded-xl bg-white text-base! sm:text-sm!";
  const labels = {
    service: service ? "Editar serviço" : "Novo serviço",
    barber: barber ? "Editar profissional" : "Novo barbeiro",
    commission: "Editar regra de comissão",
    schedule: "Configurar escala",
    payout: "Registrar repasse",
    bulk:
      editor.kind === "bulk" && editor.action === "cancel"
        ? "Cancelar agendamentos"
        : "Remanejar agendamentos",
  };
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const action = async () => {
      if (editor.kind === "service") {
        const cents = Math.round(Number(price.replace(",", ".")) * 100);
        if (!price.trim() || !Number.isFinite(cents) || cents < 0)
          throw new Error("Informe um preço válido.");
        const item = {
          name: name.trim(),
          description,
          category,
          priceCents: cents,
          durationMinutes: duration,
          active,
        };
        if (service) await api.updateService({ ...item, id: service.id });
        else
          await api.createService({
            name: item.name,
            description,
            category,
            price_cents: cents,
            duration_minutes: duration,
            active,
          });
      } else if (editor.kind === "barber") {
        if (barber)
          await api.editBarber(barber.id, {
            display_name: name.trim(),
            photo_url: photo || undefined,
            active,
          });
        else
          await api.createBarber({
            display_name: name.trim(),
            email,
            password,
            photo_url: photo || undefined,
          });
      } else if (editor.kind === "schedule") {
        const minute = (value: string) => {
          const [h, m] = value.split(":").map(Number);
          return h * 60 + m;
        };
        if (end <= start)
          throw new Error("O fim deve ser posterior ao início.");
        await api.createSchedule({
          barber_user_id: editor.item.id,
          weekday: Number(weekday),
          start_minute: minute(start),
          end_minute: minute(end),
        });
      } else if (editor.kind === "payout")
        await api.recordPayout(
          editor.item.id,
          editor.item.outstanding_cents,
          key.current,
        );
      else if (editor.kind === "bulk")
        await api.bulkAgenda(
          editor.action,
          editor.items.map((item) => ({
            id: item.id,
            ...(editor.action === "move"
              ? {
                  starts_at: moveToDate(item.startsAt ?? item.date, date),
                  barber_user_id:
                    barberId === "keep" ? item.barberId : barberId,
                }
              : {}),
          })),
        );
    };
    if (
      await run(
        action,
        editor.kind === "payout" ? "Repasse registrado." : "Alterações salvas.",
      )
    )
      onClose();
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="owner-dialog">
        <DialogTitle className="pr-8 text-lg font-semibold">
          {labels[editor.kind]}
        </DialogTitle>
        <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
          {editor.kind === "payout"
            ? `Confirme apenas um pagamento já realizado a ${editor.item.name}. O registro quita o saldo acumulado e não transfere dinheiro.`
            : editor.kind === "bulk"
              ? `${editor.items.length} agendamento(s) selecionado(s). O lote será salvo somente se todas as alterações forem válidas.`
              : "As alterações são salvas na plataforma da NA Barbearia."}
        </DialogDescription>
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-red-50 p-3 text-xs text-red-700"
          >
            {error}
          </p>
        )}
        {editor.kind === "commission" ? (
          <CommissionRuleForm
            initialBarberId={editor.item.id}
            barbers={team
              .filter((item) => item.active)
              .map((item) => ({
                id: item.id,
                name: item.name,
                initials: item.name.slice(0, 2),
              }))}
            services={services.filter((item) => item.active !== false)}
            onSaved={async () => {
              await refresh();
              onClose();
            }}
          />
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <fieldset disabled={busy} className="space-y-3">
              {(editor.kind === "service" || editor.kind === "barber") && (
                <label className="block space-y-1 text-xs font-semibold">
                  Nome
                  <Input
                    required
                    minLength={2}
                    maxLength={120}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={field}
                  />
                </label>
              )}
              {editor.kind === "service" && (
                <>
                  <label className="block space-y-1 text-xs font-semibold">
                    Categoria
                    <Input
                      required
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className={field}
                    />
                  </label>
                  <label className="block space-y-1 text-xs font-semibold">
                    Descrição
                    <Input
                      maxLength={1000}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className={field}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block space-y-1 text-xs font-semibold">
                      Preço (R$)
                      <Input
                        required
                        inputMode="decimal"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        className={field}
                      />
                    </label>
                    <label className="block space-y-1 text-xs font-semibold">
                      Duração (min)
                      <Input
                        required
                        type="number"
                        min={5}
                        max={720}
                        value={duration}
                        onChange={(e) => setDuration(Number(e.target.value))}
                        className={field}
                      />
                    </label>
                  </div>
                </>
              )}
              {editor.kind === "barber" && (
                <>
                  {!barber && (
                    <>
                      <label className="block space-y-1 text-xs font-semibold">
                        E-mail de acesso
                        <Input
                          required
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className={field}
                        />
                      </label>
                      <label className="block space-y-1 text-xs font-semibold">
                        Senha inicial
                        <Input
                          required
                          type="password"
                          minLength={8}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className={field}
                        />
                      </label>
                    </>
                  )}
                  <label className="block space-y-1 text-xs font-semibold">
                    Foto (URL HTTPS, opcional)
                    <Input
                      type="url"
                      value={photo}
                      onChange={(e) => setPhoto(e.target.value)}
                      className={field}
                    />
                  </label>
                </>
              )}
              {(editor.kind === "service" ||
                (editor.kind === "barber" && barber)) && (
                <label className="flex min-h-11 items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                  />
                  Ativo para novos agendamentos
                </label>
              )}
              {editor.kind === "schedule" && (
                <>
                  <p className="text-sm font-semibold">{editor.item.name}</p>
                  <OwnerSelect
                    label="Dia da semana"
                    value={weekday}
                    onChange={setWeekday}
                    options={[
                      "Domingo",
                      "Segunda",
                      "Terça",
                      "Quarta",
                      "Quinta",
                      "Sexta",
                      "Sábado",
                    ].map((label, value) => ({ value: String(value), label }))}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-xs font-semibold">
                      Início
                      <Input
                        type="time"
                        required
                        value={start}
                        onChange={(e) => setStart(e.target.value)}
                        className={field}
                      />
                    </label>
                    <label className="block text-xs font-semibold">
                      Fim
                      <Input
                        type="time"
                        required
                        value={end}
                        onChange={(e) => setEnd(e.target.value)}
                        className={field}
                      />
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Adiciona um período semanal em horário de Brasília.
                  </p>
                </>
              )}
              {editor.kind === "payout" && (
                <p className="rounded-xl bg-blue-50 p-4 text-xl font-bold text-primary">
                  {money(editor.item.outstanding_cents)}
                </p>
              )}
              {editor.kind === "bulk" && editor.action === "move" && (
                <>
                  <label className="block space-y-1 text-xs font-semibold">
                    Nova data
                    <Input
                      required
                      type="date"
                      min={today()}
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className={field}
                    />
                  </label>
                  <OwnerSelect
                    label="Profissional de destino"
                    value={barberId}
                    onChange={setBarberId}
                    options={[
                      {
                        value: "keep",
                        label: "Manter profissional de cada reserva",
                      },
                      ...team
                        .filter((item) => item.active)
                        .map((item) => ({ value: item.id, label: item.name })),
                    ]}
                  />
                  <p className="text-xs text-muted-foreground">
                    Os horários e as durações originais são mantidos. Conflitos
                    impedem a alteração de todo o lote.
                  </p>
                </>
              )}
              <div className="owner-dialog-actions flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  className="min-h-11 rounded-xl text-xs!"
                >
                  Voltar
                </Button>
                <Button
                  type="submit"
                  variant={
                    editor.kind === "bulk" && editor.action === "cancel"
                      ? "destructive"
                      : "default"
                  }
                  className="min-h-11 rounded-xl text-xs!"
                >
                  {busy
                    ? "Salvando…"
                    : editor.kind === "payout"
                      ? "Confirmar repasse realizado"
                      : editor.kind === "bulk"
                        ? "Confirmar alterações"
                        : "Salvar"}
                </Button>
              </div>
            </fieldset>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
