import { tokens, fold } from "./text";

const STOP = new Set(["de", "la", "el", "los", "las", "en", "con", "y", "del", "al", "un", "una", "para", "por", "a", "tributo", "noche"]);

function sig(title: string): string[] {
  return tokens(title).filter((t) => !STOP.has(t));
}

/** Clave estable: título normalizado + día local + lugar. Sirve para coincidencias exactas. */
export function dedupeKey(e: { title: string; dayKey: string; venue: string }): string {
  const t = sig(e.title).sort().join("-");
  const v = tokens(e.venue).filter((x) => !STOP.has(x)).join("-");
  return `${e.dayKey}|${t}|${v}`;
}

function bigrams(s: string): Set<string> {
  const f = fold(s).replace(/[^a-z0-9]+/g, " ").trim();
  const out = new Set<string>();
  for (let i = 0; i < f.length - 1; i++) out.add(f.slice(i, i + 2));
  return out;
}

/** Coeficiente de Dice sobre bigramas (0..1). */
export function similarity(a: string, b: string): number {
  const x = bigrams(a), y = bigrams(b);
  if (!x.size || !y.size) return 0;
  let inter = 0;
  for (const g of x) if (y.has(g)) inter++;
  return (2 * inter) / (x.size + y.size);
}

export interface DedupeInput {
  title: string;
  startsAt: Date;
  venue: string;
  placeId: string;
  organizer?: string;
  /** false si la hora es desconocida (entonces no se compara la hora). */
  hasTime?: boolean;
}

/**
 * ¿Es el mismo evento? Mismo día local (la comparación de día la hace quien llama vía `sameDay`)
 * y título muy parecido; el lugar refuerza o, si ambos lo tienen y son muy distintos, descarta.
 */
export function isDuplicate(a: DedupeInput, b: DedupeInput, sameDay: boolean): boolean {
  if (!sameDay || a.placeId !== b.placeId) return false;
  const ts = similarity(a.title, b.title);
  const venueKnown = (v: string) => tokens(v).length > 0 && !/por confirmar|por definir/.test(fold(v));
  const vs = venueKnown(a.venue) && venueKnown(b.venue) ? similarity(a.venue, b.venue) : null;
  if (vs !== null && vs < 0.35) return false; // lugares distintos = eventos distintos (los alias se resuelven a nivel de fuente)
  const bothTimed = a.hasTime !== false && b.hasTime !== false;
  // Dos funciones el mismo día (más de 3 h de diferencia) no son el mismo evento.
  if (bothTimed && Math.abs(a.startsAt.getTime() - b.startsAt.getTime()) > 3 * 3_600_000) return false;
  const sameOrganizer = !!a.organizer && !!b.organizer && similarity(a.organizer, b.organizer) > 0.8;
  if (ts >= 0.85) return true;
  return ts >= 0.7 && (vs === null || vs >= 0.6 || sameOrganizer);
}
