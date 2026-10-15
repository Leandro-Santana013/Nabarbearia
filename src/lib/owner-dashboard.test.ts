import { describe, expect, it } from "vitest";
import { moveToDate, noShowRate, ownerRange } from "./owner-dashboard";
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
  it("remaneja preservando horário de Brasília em vez do horário UTC", () => {
    expect(moveToDate("2026-10-16T01:15:00Z", "2026-10-20")).toBe(
      "2026-10-21T01:15:00.000Z",
    );
  });
  it("calcula taxa de faltas sem dividir por zero", () => {
    expect(noShowRate({ no_show_count: 1, total_count: 3 })).toBe(33.3);
    expect(noShowRate({ no_show_count: 0, total_count: 0 })).toBe(0);
  });
});
