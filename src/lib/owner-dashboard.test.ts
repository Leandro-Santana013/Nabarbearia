import { describe, expect, it } from "vitest";
import {
  addDays,
  addExtraService,
  customRange,
  periodBounds,
  periodRangeLabel,
  quickRangeDates,
  validateCustomRange,
  agendaStatus,
  agendaStatusLabel,
  agendaStatusLegend,
  appointmentLocalDateTime,
  availableExtraServices,
  checkoutLines,
  checkoutTotal,
  correctionPreview,
  parseMoneyInput,
  moveToDateTime,
  noShowRate,
  ownerAgendaRows,
  ownerRange,
  paidPaymentLabel,
  paidPaymentMethods,
  removeExtraService,
  type CheckoutLine,
  type OwnerScheduleInterval,
} from "./owner-dashboard";
import type { Appointment, Service } from "@/types";

function appointment(
  id: string,
  barberId: string,
  startsAt: string,
  status: Appointment["status"] = "confirmed",
): Appointment {
  return {
    id,
    clientName: id,
    barberId,
    serviceId: "service",
    date: startsAt,
    time: startsAt,
    startsAt,
    status,
    amountCents: 0,
  };
}

describe("gestão do proprietário", () => {
  it("delimita o mês de São Paulo, inclusive na virada do ano", () => {
    expect(ownerRange("2026-12-15", "month")).toEqual({
      from: "2026-12-01T03:00:00.000Z",
      to: "2027-01-01T03:00:00.000Z",
    });
    expect(ownerRange("2026-10-15", "day")).toEqual({
      from: "2026-10-15T03:00:00.000Z",
      to: "2026-10-16T03:00:00.000Z",
    });
  });
  it("edita data e horário usando o fuso de Brasília", () => {
    expect(appointmentLocalDateTime("2026-11-09T16:00:00.000Z")).toEqual({
      date: "2026-11-09",
      time: "13:00",
    });
    expect(moveToDateTime("2026-11-09", "14:30")).toBe(
      "2026-11-09T17:30:00.000Z",
    );
  });
  it("calcula taxa de faltas sem dividir por zero", () => {
    expect(noShowRate({ no_show_count: 1, total_count: 3 })).toBe(33.3);
    expect(noShowRate({ no_show_count: 0, total_count: 0 })).toBe(0);
  });
  it("monta linhas de 30 minutos por escala e mostra nomes apenas no início", () => {
    const schedules: OwnerScheduleInterval[] = [
      { barberId: "one", startMinute: 600, endMinute: 660 },
      { barberId: "two", startMinute: 630, endMinute: 690 },
    ];
    const rows = ownerAgendaRows(
      [
        appointment("Cliente A", "one", "2026-10-19T13:00:00Z"),
        appointment("Cliente B", "two", "2026-10-19T13:30:00Z"),
        appointment("Cancelado", "one", "2026-10-19T13:30:00Z", "cancelled"),
        appointment("Concluído", "two", "2026-10-19T14:00:00Z", "completed"),
      ],
      schedules,
      [{ id: "one" }, { id: "two" }],
      "2026-10-19",
    );

    expect(rows.map((row) => row.time)).toEqual(["10:00", "10:30", "11:00"]);
    expect(rows[0].cells.map((cell) => cell.appointments[0]?.clientName)).toEqual([
      "Cliente A",
      undefined,
    ]);
    expect(rows[1].cells.map((cell) => cell.appointments[0]?.clientName)).toEqual([
      undefined,
      "Cliente B",
    ]);
    expect(rows[2].cells.map((cell) => cell.appointments[0]?.clientName)).toEqual([
      undefined,
      "Concluído",
    ]);
    expect(rows[0].cells.map((cell) => cell.inSchedule)).toEqual([true, false]);
    expect(rows[1].cells.map((cell) => cell.inSchedule)).toEqual([true, true]);
  });
  it("mostra cancelados sem ocupar o horário", () => {
    const rows = ownerAgendaRows(
      [
        appointment("Cancelado", "one", "2026-10-19T13:00:00Z", "cancelled"),
        appointment("Novo", "one", "2026-10-19T13:00:00Z"),
        appointment("Só cancelado", "one", "2026-10-19T13:30:00Z", "cancelled"),
      ],
      [{ barberId: "one", startMinute: 600, endMinute: 660 }],
      [{ id: "one" }],
      "2026-10-19",
    );

    expect(rows[0].cells[0].appointments.map((item) => item.clientName)).toEqual(["Novo"]);
    expect(rows[0].cells[0].cancelledAppointments.map((item) => item.clientName)).toEqual(["Cancelado"]);
    expect(rows[1].cells[0]).toMatchObject({
      inSchedule: true,
      appointments: [],
      cancelledAppointments: [{ clientName: "Só cancelado" }],
    });
  });
  it("deriva o status visual sem criar estados no backend", () => {
    expect(agendaStatus({ status: "confirmed" })).toBe("scheduled");
    expect(agendaStatus({ status: "confirmed", executionStarted: true })).toBe("in-progress");
    expect(agendaStatus({ status: "completed", executionStarted: true })).toBe("completed");
    expect(agendaStatus({ status: "cancelled" })).toBe("cancelled");
    expect(agendaStatus({ status: "no-show" })).toBe("no-show");
    expect(agendaStatusLabel({ status: "confirmed", executionStarted: true })).toBe("Em atendimento");
    expect(agendaStatusLegend.map((item) => item.label)).toEqual([
      "Agendado",
      "Em atendimento",
      "Concluído",
      "Cancelado",
      "Falta",
    ]);
  });
  it("filtra a grade por barbeiro e não perde reservas fora da escala", () => {
    const rows = ownerAgendaRows(
      [appointment("Encaixe", "two", "2026-10-19T15:15:00Z")],
      [{ barberId: "one", startMinute: 600, endMinute: 630 }],
      [{ id: "two" }],
      "2026-10-19",
    );

    expect(rows.map((row) => row.time)).toEqual(["12:15"]);
    expect(rows[0].cells[0]).toMatchObject({
      barberId: "two",
      inSchedule: false,
      appointments: [{ clientName: "Encaixe" }],
    });
  });
  describe("fechamento do atendimento", () => {
    const service = (id: string, name: string, priceCents: number, active = true): Service => ({
      id, name, priceCents, active, description: "", category: "Cabelo", durationMinutes: 30,
    });
    const catalog = [
      service("corte", "Corte masculino", 4500),
      service("barba", "Barba", 3000),
      service("sobrancelha", "Sobrancelha", 1500),
      service("antigo", "Serviço desativado", 900, false),
    ];
    // O serviço agendado mantém o preço gravado no agendamento (R$ 40,00), mesmo com o catálogo em R$ 45,00.
    const original: CheckoutLine = { serviceId: "corte", serviceName: "Corte masculino", priceCents: 4000, isOriginal: true };

    it("conclui com um serviço usando o preço agendado", () => {
      const lines = checkoutLines(original, [], catalog);
      expect(lines).toEqual([original]);
      expect(checkoutTotal(lines)).toBe(4000);
    });
    it("soma extras pelo preço real do catálogo sem recontar o serviço original", () => {
      const lines = checkoutLines(original, ["barba", "sobrancelha"], catalog);
      expect(lines.map((line) => [line.serviceName, line.priceCents, line.isOriginal])).toEqual([
        ["Corte masculino", 4000, true],
        ["Barba", 3000, false],
        ["Sobrancelha", 1500, false],
      ]);
      expect(checkoutTotal(lines)).toBe(8500);
    });
    it("evita duplicidades e remove extras adicionados por engano", () => {
      let extras = addExtraService([], "barba", "corte");
      extras = addExtraService(extras, "barba", "corte");
      extras = addExtraService(extras, "corte", "corte");
      extras = addExtraService(extras, "", "corte");
      expect(extras).toEqual(["barba"]);
      extras = addExtraService(extras, "sobrancelha", "corte");
      expect(removeExtraService(extras, "barba")).toEqual(["sobrancelha"]);
      expect(checkoutTotal(checkoutLines(original, removeExtraService(extras, "barba"), catalog))).toBe(5500);
    });
    it("oferece apenas serviços ativos que ainda não estão no atendimento", () => {
      expect(availableExtraServices(catalog, "corte", ["barba"]).map((item) => item.id)).toEqual(["sobrancelha"]);
    });
    it("lista as quatro formas de pagamento recebido", () => {
      expect(paidPaymentMethods.map((item) => item.label)).toEqual(["Pix", "Dinheiro", "Cartão de débito", "Cartão de crédito"]);
      expect(paidPaymentLabel("credit_card")).toBe("Cartão de crédito");
      expect(paidPaymentLabel(undefined)).toBe("Não registrado");
    });
  });
  describe("correção administrativa", () => {
    const corte = { serviceId: "corte", serviceName: "Corte masculino", priceCents: 4000 };
    const barba = { serviceId: "barba", serviceName: "Barba", priceCents: 3000 };
    const sobrancelha = { serviceId: "sobrancelha", serviceName: "Sobrancelha", priceCents: 1500 };

    it("interpreta valores digitados em reais", () => {
      expect(parseMoneyInput("40")).toBe(4000);
      expect(parseMoneyInput("40,5")).toBe(4050);
      expect(parseMoneyInput("R$ 1.234,56")).toBe(123456);
      expect(parseMoneyInput("40.50")).toBe(4050);
      expect(parseMoneyInput("")).toBeNull();
      expect(parseMoneyInput("-10")).toBeNull();
      expect(parseMoneyInput("abc")).toBeNull();
    });
    it("mostra antes e depois ao remover um serviço lançado por engano", () => {
      const preview = correctionPreview([corte, barba, sobrancelha], [corte, barba], "pix", "pix");
      expect([preview.previousTotal, preview.newTotal]).toEqual([8500, 7000]);
      expect(preview.removed.map((line) => line.serviceName)).toEqual(["Sobrancelha"]);
      expect(preview.added).toEqual([]);
      expect(preview.changed).toBe(true);
    });
    it("detecta troca de pagamento, inclusão e ajuste de valor", () => {
      const preview = correctionPreview([corte], [{ ...corte, priceCents: 3500 }, barba], "pix", "cash");
      expect(preview.paymentChanged).toBe(true);
      expect(preview.added.map((line) => line.serviceId)).toEqual(["barba"]);
      expect(preview.repriced).toEqual([{ serviceName: "Corte masculino", previousCents: 4000, newCents: 3500 }]);
      expect(preview.newTotal).toBe(6500);
    });
    it("não considera alteração quando nada mudou", () => {
      expect(correctionPreview([corte, barba], [corte, barba], "pix", "pix").changed).toBe(false);
    });
  });
  describe("filtros de período do financeiro", () => {
    it("inclui o primeiro e o último dia inteiros no fuso de Brasília", () => {
      expect(customRange("2026-05-12", "2026-07-07")).toEqual({
        from: "2026-05-12T03:00:00.000Z",
        to: "2026-07-08T03:00:00.000Z",
      });
    });
    it("aceita data inicial igual à final como um único dia", () => {
      expect(validateCustomRange("2026-11-23", "2026-11-23")).toBeNull();
      expect(customRange("2026-11-23", "2026-11-23")).toEqual({
        from: "2026-11-23T03:00:00.000Z",
        to: "2026-11-24T03:00:00.000Z",
      });
    });
    it("cruza meses e anos sem limitar ao mês ou ano atual", () => {
      expect(customRange("2025-12-20", "2026-01-10")).toEqual({
        from: "2025-12-20T03:00:00.000Z",
        to: "2026-01-11T03:00:00.000Z",
      });
      expect(validateCustomRange("2024-02-01", "2026-11-23")).toBeNull();
      expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
      expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    });
    it("explica datas inválidas", () => {
      expect(validateCustomRange("2026-07-07", "2026-05-12")).toBe("A data inicial não pode ser posterior à data final.");
      expect(validateCustomRange("", "2026-05-12")).toBe("Informe a data inicial e a data final.");
      expect(validateCustomRange("2026-02-30", "2026-03-01")).toBe("Data inicial inválida. Use o formato DD/MM/AAAA.");
      expect(validateCustomRange("2010-01-01", "2026-01-01")).toBe("Selecione um período de até 10 anos.");
    });
    it("calcula os filtros rápidos incluindo hoje", () => {
      const today = "2026-03-05";
      expect(quickRangeDates("today", today)).toEqual({ start: "2026-03-05", end: "2026-03-05" });
      expect(quickRangeDates("last7", today)).toEqual({ start: "2026-02-27", end: "2026-03-05" });
      expect(quickRangeDates("last30", today)).toEqual({ start: "2026-02-04", end: "2026-03-05" });
      expect(quickRangeDates("thisMonth", today)).toEqual({ start: "2026-03-01", end: "2026-03-05" });
      expect(quickRangeDates("thisYear", today)).toEqual({ start: "2026-01-01", end: "2026-03-05" });
    });
    it("mantém dia e mês com os mesmos limites de antes e mostra o intervalo em DD/MM/AAAA", () => {
      const custom = { start: "2026-05-12", end: "2026-07-07" };
      expect(periodBounds("day", "2026-11-23", custom)).toEqual({ start: "2026-11-23", end: "2026-11-23" });
      expect(periodBounds("month", "2026-02-10", custom)).toEqual({ start: "2026-02-01", end: "2026-02-28" });
      expect(periodBounds("custom", "2026-02-10", custom)).toEqual(custom);
      const month = periodBounds("month", "2026-02-10", custom);
      expect(customRange(month.start, month.end)).toEqual(ownerRange("2026-02-10", "month"));
      expect(customRange("2026-11-23", "2026-11-23")).toEqual(ownerRange("2026-11-23", "day"));
      expect(periodRangeLabel("2026-05-12", "2026-07-07")).toBe("Período: 12/05/2026 a 07/07/2026");
      expect(periodRangeLabel("2026-11-23", "2026-11-23")).toBe("Período: 23/11/2026");
    });
  });
});
