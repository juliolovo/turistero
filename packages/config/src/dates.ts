import type { DateRangeKey } from "@turistero/types";

/** Componentes de calendario de un instante en una zona horaria. */
export function zonedParts(date: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday!);
  return { y: +p.year!, m: +p.month!, d: +p.day!, h: +p.hour!, mi: +p.minute!, s: +p.second!, dow };
}

/** Convierte hora de pared en `timeZone` a un instante UTC. */
export function zonedTimeToUtc(y: number, m: number, d: number, h: number, mi: number, timeZone: string): Date {
  const norm = new Date(Date.UTC(y, m - 1, d, h, mi)); // normaliza desbordes
  const guess = norm.getTime();
  const z = zonedParts(norm, timeZone);
  const asIfUtc = Date.UTC(z.y, z.m - 1, z.d, z.h, z.mi, z.s);
  return new Date(guess - (asIfUtc - guess));
}

export function startOfDayUtc(date: Date, timeZone: string, addDays = 0): Date {
  const { y, m, d } = zonedParts(date, timeZone);
  return zonedTimeToUtc(y, m, d + addDays, 0, 0, timeZone);
}

export interface Range {
  from: Date;
  to: Date; // exclusivo
}

export function resolveRange(
  key: DateRangeKey,
  now: Date,
  timeZone: string,
  custom?: { from?: string; to?: string },
): Range {
  const today = startOfDayUtc(now, timeZone);
  const week = { from: today, to: startOfDayUtc(now, timeZone, 7) };
  switch (key) {
    case "today":
      return { from: today, to: startOfDayUtc(now, timeZone, 1) };
    case "tomorrow":
      return { from: startOfDayUtc(now, timeZone, 1), to: startOfDayUtc(now, timeZone, 2) };
    case "weekend": {
      const { dow } = zonedParts(now, timeZone);
      // Viernes a domingo; si hoy ya es fin de semana, desde hoy. Termina el lunes 00:00.
      const toFri = dow === 0 ? 0 : dow === 6 ? 0 : 5 - dow;
      const from = startOfDayUtc(now, timeZone, toFri);
      const toMon = dow === 0 ? 1 : 8 - dow;
      return { from: from < today ? today : from, to: startOfDayUtc(now, timeZone, toMon) };
    }
    case "custom": {
      const parse = (s: string | undefined, add: number) => {
        const m = s ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(s) : null;
        return m ? zonedTimeToUtc(+m[1]!, +m[2]!, +m[3]! + add, 0, 0, timeZone) : null;
      };
      const from = parse(custom?.from, 0);
      const to = parse(custom?.to ?? custom?.from, 1);
      return from && to && to > from ? { from, to } : week;
    }
    case "week":
    default:
      return week;
  }
}

export function formatDay(iso: string, timeZone: string, locale = "es"): string {
  return new Intl.DateTimeFormat(locale, { timeZone, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
}
export function formatShortDay(iso: string, timeZone: string, locale = "es"): string {
  return new Intl.DateTimeFormat(locale, { timeZone, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
}
export function formatTime(iso: string, timeZone: string, locale = "es"): string {
  return new Intl.DateTimeFormat(locale, { timeZone, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
}
export function dayKey(iso: string, timeZone: string): string {
  const { y, m, d } = zonedParts(new Date(iso), timeZone);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
