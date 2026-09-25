import { startOfDayUtc, zonedParts, zonedTimeToUtc } from "@turistero/config";
import { fold } from "./text";

const MONTHS: Record<string, number> = {
  enero: 1, ene: 1, febrero: 2, feb: 2, marzo: 3, mar: 3, abril: 4, abr: 4, mayo: 5, may: 5, junio: 6, jun: 6,
  julio: 7, jul: 7, agosto: 8, ago: 8, septiembre: 9, setiembre: 9, sept: 9, sep: 9, set: 9, octubre: 10, oct: 10,
  noviembre: 11, nov: 11, diciembre: 12, dic: 12,
};
const WEEKDAYS: Record<string, number> = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
const WEEKDAY_RE = Object.keys(WEEKDAYS).join("|");

export interface ParsedDateTime {
  start: Date; // instante UTC
  end?: Date;
  hasTime: boolean;
  /** true si el día aparece explícito (fecha o día de la semana + número); false si se dedujo de "hoy", "viernes"… */
  explicitDate: boolean;
}

interface Ymd { y: number; m: number; d: number; explicit: boolean }
interface Hm { h: number; mi: number }

const validYmd = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

function resolveYear(now: Date, tz: string, m: number, d: number, y?: number): number | null {
  const today = zonedParts(now, tz);
  if (y) return y < 100 ? 2000 + y : y;
  let year = today.y;
  // Sin año: una fecha pasada hace poco (<= 45 días) se considera pasada; más antigua, del año siguiente.
  const daysPast = (Date.UTC(today.y, today.m - 1, today.d) - Date.UTC(year, m - 1, d)) / 86_400_000;
  if (daysPast > 45) year += 1;
  return year;
}

function addDays(y: number, m: number, d: number, n: number) {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

function findDate(t: string, now: Date, tz: string): Ymd | null {
  const today = zonedParts(now, tz);
  let m: RegExpExecArray | null;

  if ((m = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(t))) {
    const [y, mo, d] = [+m[1]!, +m[2]!, +m[3]!];
    if (validYmd(y, mo, d)) return { y, m: mo, d, explicit: true };
  }
  // 25 de septiembre [de 2026] | 25 sept | 25-sep
  if ((m = new RegExp(`\\b(\\d{1,2})\\s*(?:de\\s+|-|/)?\\s*(${MONTH_RE})\\b\\.?(?:\\s*(?:de|del|,)?\\s*(20\\d{2}))?`).exec(t))) {
    const [d, mo] = [+m[1]!, MONTHS[m[2]!]!];
    const y = resolveYear(now, tz, mo, d, m[3] ? +m[3] : undefined);
    if (y && validYmd(y, mo, d)) return { y, m: mo, d, explicit: true };
  }
  // septiembre 25
  if ((m = new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})\\b(?!\\s*(?::|h|hrs|am|pm))`).exec(t))) {
    const [mo, d] = [MONTHS[m[1]!]!, +m[2]!];
    const y = resolveYear(now, tz, mo, d);
    if (y && validYmd(y, mo, d)) return { y, m: mo, d, explicit: true };
  }
  // 25/09[/2026] (día/mes, convención local)
  if ((m = /\b(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?\b/.exec(t))) {
    const [d, mo] = [+m[1]!, +m[2]!];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      const y = resolveYear(now, tz, mo, d, m[3] ? +m[3] : undefined);
      if (y && validYmd(y, mo, d)) return { y, m: mo, d, explicit: true };
    }
  }
  // viernes 25 (día de la semana + número de día)
  if ((m = new RegExp(`\\b(${WEEKDAY_RE})\\s+(\\d{1,2})\\b(?!\\s*(?::|h\\b|hrs|am|pm|p\\.?m|a\\.?m))`).exec(t))) {
    const d = +m[2]!;
    for (let i = 0; i < 62; i++) {
      const c = addDays(today.y, today.m, today.d, i);
      if (c.d === d && new Date(Date.UTC(c.y, c.m - 1, c.d)).getUTCDay() === WEEKDAYS[m[1]!]) return { ...c, explicit: true };
    }
  }
  // relativos
  if (/\bhoy\b/.test(t)) return { y: today.y, m: today.m, d: today.d, explicit: false };
  if (/(?<!(?:de|por|en) la )\bmanana\b/.test(t)) return { ...addDays(today.y, today.m, today.d, 1), explicit: false };
  if ((m = new RegExp(`\\b(?:este|proximo|el|los|cada)?\\s*\\b(${WEEKDAY_RE})\\b`).exec(t))) {
    const target = WEEKDAYS[m[1]!]!;
    const diff = (target - today.dow + 7) % 7;
    return { ...addDays(today.y, today.m, today.d, diff), explicit: false };
  }
  return null;
}

function to24(h: number, mer?: string, ctx?: string): number {
  const pm = mer && /^p/.test(mer);
  const am = mer && /^a/.test(mer);
  if (pm && h < 12) return h + 12;
  if (am && h === 12) return 0;
  if (!mer && ctx) {
    if (/noche|tarde/.test(ctx) && h < 12) return h + 12;
  }
  return h;
}

function findTimes(t: string): Hm[] {
  const out: { i: number; v: Hm }[] = [];
  const push = (i: number, h: number, mi: number) => {
    if (h >= 0 && h <= 23 && mi >= 0 && mi <= 59) out.push({ i, v: { h, mi } });
  };
  let m: RegExpExecArray | null;
  const r1 = /\b(\d{1,2}):(\d{2})\s*(a\.?\s?m\.?|p\.?\s?m\.?|hrs?|h)?(?:\s+de\s+la\s+(manana|tarde|noche))?/g;
  while ((m = r1.exec(t))) push(m.index, to24(+m[1]!, m[3]?.replace(/[.\s]/g, ""), m[4]), +m[2]!);
  const r2 = /(?<![\d:])\b(\d{1,2})\s*(a\.?\s?m\.?|p\.?\s?m\.?)(?![a-z])/g;
  while ((m = r2.exec(t))) push(m.index, to24(+m[1]!, m[2]!.replace(/[.\s]/g, "")), 0);
  const r3 = /(?<![\d:])\b(\d{1,2})\s*(?:hrs?|h)\b(?!\w)/g;
  while ((m = r3.exec(t))) push(m.index, +m[1]!, 0);
  const r4 = /\ba\s+las\s+(\d{1,2})(?::(\d{2}))?\s*(?:de\s+la\s+(manana|tarde|noche))?/g;
  while ((m = r4.exec(t))) push(m.index, to24(+m[1]!, undefined, m[3]), m[2] ? +m[2] : 0);
  const r5 = /(?<![\d:])\b(\d{1,2})(?::(\d{2}))?\s+de\s+la\s+(manana|tarde|noche)\b/g;
  while ((m = r5.exec(t))) push(m.index, to24(+m[1]!, undefined, m[3]), m[2] ? +m[2] : 0);
  // sin duplicados por posición (el mismo texto puede casar con dos patrones)
  const seen = new Set<string>();
  return out.sort((a, b) => a.i - b.i).map((x) => x.v).filter((v) => !seen.has(`${v.h}:${v.mi}`) && seen.add(`${v.h}:${v.mi}`));
}

/**
 * Extrae fecha/hora de texto libre en español. Devuelve null si no hay una fecha reconocible.
 * No inventa: sin fecha no hay evento; sin hora se marca `hasTime: false` (se fija a las 00:00 locales).
 */
export function parseDateTime(text: string, opts: { now?: Date; timeZone: string }): ParsedDateTime | null {
  const now = opts.now ?? new Date();
  const t = fold(text).replace(/\s+/g, " ");
  const date = findDate(t, now, opts.timeZone);
  if (!date) return null;
  const times = findTimes(t);
  const first = times[0];
  const start = zonedTimeToUtc(date.y, date.m, date.d, first?.h ?? 0, first?.mi ?? 0, opts.timeZone);
  let end: Date | undefined;
  const second = times[1];
  if (first && second) {
    end = zonedTimeToUtc(date.y, date.m, date.d, second.h, second.mi, opts.timeZone);
    if (end <= start) end = new Date(end.getTime() + 86_400_000); // termina pasada la medianoche
  }
  return { start, end, hasTime: !!first, explicitDate: date.explicit };
}

export { startOfDayUtc };
