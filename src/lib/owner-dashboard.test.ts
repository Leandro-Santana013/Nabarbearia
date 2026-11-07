import { describe, expect, it } from "vitest";
import {
  appointmentLocalDateTime,
  moveToDateTime,
  noShowRate,
  ownerAgendaRows,
  ownerRange,
  type OwnerScheduleInterval,
} from "./owner-dashboard";
import type { Appointment } from "@/types";

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
});
