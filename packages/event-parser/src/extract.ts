import type { CategoryId, Confidence } from "@turistero/types";
import { PLACES, zonedTimeToUtc } from "@turistero/config";
import { classify } from "./classify";
import { parseDateTime } from "./dates";
import type { JsonLdEvent } from "./html";
import { parsePrice } from "./price";
import { cleanTitle, fold } from "./text";

/** Contenido crudo de una fuente (una publicación, una página, un ítem de RSS…). */
export interface SourceContent {
  sourceId: string;
  /** Perfil / sitio de la fuente. */
  profileUrl: string | null;
  /** Enlace a esta publicación concreta. null si no se conoce: nunca se sustituye por el perfil. */
  originalPostUrl: string | null;
  title?: string;
  text: string;
  publishedAt?: string;
  imageUrl?: string;
  structured?: JsonLdEvent;
}

export interface EventCandidate {
  title: string;
  description: string;
  category: CategoryId;
  startsAt: Date;
  endsAt?: Date;
  hasTime: boolean;
  venue: string;
  placeId: string;
  address?: string;
  lat?: number;
  lng?: number;
  organizer?: string;
  price: { isFree: boolean; currency?: string; min?: number; max?: number; note?: string };
  image?: { url: string; source?: string };
  sourceId: string;
  profileUrl: string | null;
  originalPostUrl: string | null;
  discoveredAt: Date;
  confidence: Confidence;
  /** Motivos legibles de la confianza asignada (útil en revisión). */
  reasons: string[];
}

export interface ExtractContext {
  now?: Date;
  timeZone: string;
  defaultPlaceId: string;
  /** Nombre del lugar cuando la fuente es un venue (el evento ocurre ahí salvo que diga otra cosa). */
  defaultVenue?: string;
  organizer?: string;
  sourceName?: string;
}

const VENUE_PATTERNS = [
  /(?:lugar|ubicaci[oó]n|d[oó]nde|sede)\s*[:\-–]\s*([^\n|.]{3,80})/i,
  /📍\s*([^\n|,.]{3,60})/u,
  /\ben\s+(?:el\s+|la\s+|los\s+|las\s+)?((?:[A-ZÁÉÍÓÚÑ][\wáéíóúñÁÉÍÓÚÑ'’&-]+)(?:\s+(?:de\s+|del\s+|la\s+|el\s+)?[A-ZÁÉÍÓÚÑ][\wáéíóúñÁÉÍÓÚÑ'’&-]+){0,4})/,
];

function findVenue(text: string): string | undefined {
  for (const re of VENUE_PATTERNS) {
    const m = re.exec(text);
    const v = m?.[1]?.trim().replace(/[,;:]+$/, "");
    if (v && !/^(vivo|un|una|el|la|los|las|este|esta|septiembre|octubre|noviembre|diciembre|enero|febrero|marzo|abril|mayo|junio|julio|agosto)\b/i.test(v)) return v;
  }
  return undefined;
}

function findPlace(text: string, fallback: string): { id: string; explicit: boolean } {
  const t = fold(text);
  for (const p of PLACES) if (new RegExp(`\\b${fold(p.name)}\\b`).test(t)) return { id: p.id, explicit: true };
  return { id: fallback, explicit: false };
}

const DAY_WORDS = "lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|hoy|ma[nñ]ana";
const MONTH_WORDS = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|sep?tiembre|setiembre|sept?|octubre|oct|noviembre|nov|diciembre|dic|ene|feb|mar|abr|jun|jul|ago";
// Primer indicio de fecha u hora en una línea: desde ahí ya no es parte del título.
const DATE_START = new RegExp(
  `[\\s,.\\-–—:|(]+(?:(?:este|pr[oó]ximo|el)\\s+)?(?:(?:${DAY_WORDS})\\b|\\d{1,2}\\s*(?:de\\s+)?(?:${MONTH_WORDS})\\b|\\d{1,2}[/.]\\d{1,2}\\b|\\d{1,2}(?::\\d{2})?\\s*(?:am|pm|hrs?)\\b)`,
  "i",
);

function firstSentence(text: string): string {
  let line = (text.split(/\n|(?<=[.!?])\s/)[0] ?? text).trim();
  const cut = DATE_START.exec(line);
  if (cut && cut.index >= 6) line = line.slice(0, cut.index);
  return line.length > 100 ? line.slice(0, 97).trimEnd() + "…" : line;
}

/**
 * Convierte contenido crudo en un candidato a evento, o `null` si no hay una fecha reconocible o ya pasó.
 * Nunca inventa datos: lo que no se puede determinar queda vacío y baja la confianza.
 */
export function extractCandidate(c: SourceContent, ctx: ExtractContext): EventCandidate | null {
  const now = ctx.now ?? new Date();
  const reasons: string[] = [];
  const s = c.structured;

  let title: string;
  let startsAt: Date;
  let endsAt: Date | undefined;
  let hasTime = true;
  let explicitDate = true;
  let venue: string | undefined;

  if (s?.startDate) {
    title = cleanTitle(s.name);
    const hasOffset = /(Z|[+-]\d{2}:?\d{2})$/.test(s.startDate);
    const parsed = hasOffset ? new Date(s.startDate) : null;
    if (parsed && !Number.isNaN(parsed.getTime())) startsAt = parsed;
    else {
      const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(s.startDate);
      if (!m) return null;
      hasTime = m[4] !== undefined;
      startsAt = zonedTimeToUtc(+m[1]!, +m[2]!, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0), ctx.timeZone);
    }
    if (s.endDate) {
      const e = new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(s.endDate) ? s.endDate : s.endDate + "Z");
      if (!Number.isNaN(e.getTime()) && /(Z|[+-]\d{2}:?\d{2})$/.test(s.endDate)) endsAt = e;
    }
    venue = s.locationName;
    reasons.push("datos estructurados (JSON-LD)");
  } else {
    const body = c.text;
    const dt = parseDateTime(`${c.title ?? ""}\n${body}`, { now, timeZone: ctx.timeZone });
    if (!dt) return null;
    ({ start: startsAt, end: endsAt, hasTime, explicitDate } = dt);
    title = cleanTitle(c.title && c.title.length > 3 ? c.title : firstSentence(body));
    venue = findVenue(`${c.title ?? ""}\n${body}`);
  }

  if (!title || title.length < 3) return null;
  // Eventos ya terminados no interesan (margen de 3 h para los que están en curso).
  if ((endsAt ?? startsAt).getTime() < now.getTime() - 3 * 3_600_000) return null;

  const fullText = `${c.title ?? ""}\n${c.text}\n${s?.description ?? ""}`;
  const cls = classify(title, fullText);
  const category: CategoryId = cls.category ?? "party";
  const place = findPlace(`${venue ?? ""} ${s?.city ?? ""} ${fullText}`, ctx.defaultPlaceId);
  const price = s?.price !== undefined
    ? s.price === 0 ? { isFree: true } : { isFree: false, currency: s.priceCurrency, min: s.price, max: s.price }
    : parsePrice(fullText) ?? { isFree: false, note: "Precio por confirmar" };
  const finalVenue = venue ?? ctx.defaultVenue ?? "Lugar por confirmar";

  // ---- confianza ----
  let confidence: Confidence;
  const knownVenue = !!venue || !!ctx.defaultVenue;
  if (s?.startDate) {
    confidence = knownVenue ? "HIGH" : "MEDIUM";
  } else if (explicitDate && hasTime && knownVenue && cls.category && cls.score >= 0.25) {
    confidence = "HIGH";
    reasons.push("fecha, hora, lugar y categoría claros");
  } else if (explicitDate && (hasTime || knownVenue)) {
    confidence = "MEDIUM";
    if (!hasTime) reasons.push("sin hora");
    if (!knownVenue) reasons.push("sin lugar");
  } else {
    confidence = "LOW";
    if (!explicitDate) reasons.push("fecha deducida de una referencia relativa");
    else reasons.push("información incompleta");
  }
  if (!cls.category) {
    reasons.push("categoría no reconocida");
    if (confidence === "HIGH") confidence = "MEDIUM";
  }
  if (!c.originalPostUrl) reasons.push("sin enlace directo a la publicación");

  return {
    title,
    description: (s?.description ?? c.text).replace(/\s+/g, " ").trim().slice(0, 1200),
    category,
    startsAt,
    endsAt,
    hasTime,
    venue: finalVenue,
    placeId: place.id,
    address: s?.locationAddress,
    lat: s?.lat,
    lng: s?.lng,
    organizer: s?.organizer ?? ctx.organizer,
    price,
    image: (s?.image ?? c.imageUrl) ? { url: (s?.image ?? c.imageUrl)!, source: ctx.sourceName } : undefined,
    sourceId: c.sourceId,
    profileUrl: c.profileUrl,
    originalPostUrl: c.originalPostUrl,
    discoveredAt: now,
    confidence,
    reasons,
  };
}
