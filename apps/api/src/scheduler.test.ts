import { describe, expect, it } from "vitest";
import { shouldRunScheduled } from "./scheduler";

// 2026-09-25 es viernes. Managua = UTC-6 sin horario de verano: 05:15 locales = 11:15 UTC.
const at = (iso: string) => new Date(iso);

describe("shouldRunScheduled (lun/mié/vie 05:15 America/Managua)", () => {
  it("no corre antes de las 05:15 locales", () => {
    expect(shouldRunScheduled(at("2026-09-25T11:14:00Z"), null)).toBe(false);
  });
  it("corre desde las 05:15 locales", () => {
    expect(shouldRunScheduled(at("2026-09-25T11:15:00Z"), null)).toBe(true);
    expect(shouldRunScheduled(at("2026-09-25T20:00:00Z"), null)).toBe(true); // se recupera si el proceso estaba caído
  });
  it("una sola vez por día", () => {
    expect(shouldRunScheduled(at("2026-09-25T12:00:00Z"), at("2026-09-25T11:16:00Z"))).toBe(false);
    expect(shouldRunScheduled(at("2026-09-25T12:00:00Z"), at("2026-09-23T11:16:00Z"))).toBe(true);
  });
  it("solo lunes, miércoles y viernes", () => {
    expect(shouldRunScheduled(at("2026-09-24T12:00:00Z"), null)).toBe(false); // jueves
    expect(shouldRunScheduled(at("2026-09-26T12:00:00Z"), null)).toBe(false); // sábado
    expect(shouldRunScheduled(at("2026-09-28T12:00:00Z"), null)).toBe(true); // lunes
    expect(shouldRunScheduled(at("2026-09-30T12:00:00Z"), null)).toBe(true); // miércoles
  });
  it("usa el día local, no el UTC", () => {
    // Viernes 25 a las 23:00 locales = sábado 26 05:00 UTC: sigue siendo viernes en Managua
    expect(shouldRunScheduled(at("2026-09-26T05:00:00Z"), null)).toBe(true);
    // Lunes 28 00:30 UTC = domingo 27 18:30 local
    expect(shouldRunScheduled(at("2026-09-28T00:30:00Z"), null)).toBe(false);
  });
});
