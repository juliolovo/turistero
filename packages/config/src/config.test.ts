import { describe, expect, it } from "vitest";
import { CATEGORIES, displayTitle, formatPrice, resolveRange, startOfDayUtc, zonedTimeToUtc, zonedParts } from "./index";

const TZ = "America/Managua"; // UTC-6 sin horario de verano

describe("displayTitle", () => {
  const base = { title: "Tributo a Metallica", category: "rock" as const, price: { isFree: false } };
  const now = new Date("2026-09-24T12:00:00Z");
  it("antepone el emoji de la categoría", () => {
    expect(displayTitle({ ...base, discoveredAt: "2026-08-01T00:00:00Z" }, now)).toBe("🎸 Tributo a Metallica");
  });
  it("añade 🆕 solo si se descubrió hace pocos días", () => {
    expect(displayTitle({ ...base, discoveredAt: "2026-09-23T12:00:00Z" }, now)).toBe("🆕 🎸 Tributo a Metallica");
  });
  it("combina 🆕 🆓 y emoji", () => {
    expect(displayTitle({ ...base, price: { isFree: true }, discoveredAt: "2026-09-24T10:00:00Z" }, now)).toBe("🆕 🆓 🎸 Tributo a Metallica");
  });
  it("cada categoría tiene un emoji único", () => {
    expect(new Set(CATEGORIES.map((c) => c.emoji)).size).toBe(CATEGORIES.length);
  });
});

describe("zonas horarias", () => {
  it("convierte hora local de Managua a UTC", () => {
    expect(zonedTimeToUtc(2026, 9, 25, 20, 0, TZ).toISOString()).toBe("2026-09-26T02:00:00.000Z");
  });
  it("desborda días de forma correcta", () => {
    expect(zonedTimeToUtc(2026, 9, 31, 0, 0, TZ).toISOString()).toBe("2026-10-01T06:00:00.000Z");
  });
  it("el inicio del día usa la zona, no UTC", () => {
    const late = new Date("2026-09-25T03:00:00Z"); // 24 sep 9pm en Managua
    expect(startOfDayUtc(late, TZ).toISOString()).toBe("2026-09-24T06:00:00.000Z");
  });
});

describe("resolveRange", () => {
  const thu = new Date("2026-09-24T18:00:00Z"); // jueves 12:00 Managua
  it("hoy / mañana / 7 días", () => {
    expect(resolveRange("today", thu, TZ).to.toISOString()).toBe("2026-09-25T06:00:00.000Z");
    expect(resolveRange("tomorrow", thu, TZ).from.toISOString()).toBe("2026-09-25T06:00:00.000Z");
    const w = resolveRange("week", thu, TZ);
    expect(w.to.getTime() - w.from.getTime()).toBe(7 * 86_400_000);
  });
  it("fin de semana desde el viernes hasta el lunes 00:00", () => {
    const r = resolveRange("weekend", thu, TZ);
    expect(zonedParts(r.from, TZ)).toMatchObject({ d: 25, dow: 5 });
    expect(zonedParts(r.to, TZ)).toMatchObject({ d: 28, dow: 1, h: 0 });
  });
  it("si ya es sábado, el fin de semana empieza hoy", () => {
    const sat = new Date("2026-09-26T18:00:00Z");
    expect(zonedParts(resolveRange("weekend", sat, TZ).from, TZ).d).toBe(26);
  });
  it("rango personalizado inclusivo y con respaldo si es inválido", () => {
    const r = resolveRange("custom", thu, TZ, { from: "2026-10-01", to: "2026-10-03" });
    expect(r.to.getTime() - r.from.getTime()).toBe(3 * 86_400_000);
    const bad = resolveRange("custom", thu, TZ, { from: "x" });
    expect(bad.to.getTime() - bad.from.getTime()).toBe(7 * 86_400_000);
  });
});

describe("formatPrice", () => {
  it("formatea moneda, rangos y gratis", () => {
    expect(formatPrice({ isFree: true })).toBe("Gratis");
    expect(formatPrice({ isFree: false, currency: "NIO", min: 200 })).toBe("C$200");
    expect(formatPrice({ isFree: false, currency: "USD", min: 120, max: 160 })).toBe("US$120–US$160");
    expect(formatPrice({ isFree: false })).toBe("Precio por confirmar");
  });
});
