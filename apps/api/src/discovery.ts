import { and, eq, gte, isNull, lt, or } from "drizzle-orm";
import { PLACES, dayKey, getPlace, placesOf } from "@turistero/config";
import { checkSourceContent, createSafeFetcher, defaultAdapters, newLinksOnly, type Credential, type DiscoverySource, type SafeFetcher, type SourceAdapter } from "@turistero/discovery";
import { dedupeKey, extractCandidate, fold, isDuplicate, slugify, type EventCandidate, type SourceContent } from "@turistero/event-parser";
import {
  completeRun, createCandidate, createRun, eventSources, events, getCredential, listActiveSources, markConnectionError, newId, recordCheck, sourceCandidates, sources,
  type CheckRow, type Db, type SourceRow,
} from "@turistero/db";

export interface DiscoveryDeps {
  db: Db;
  fetcher?: SafeFetcher;
  adapters?: SourceAdapter[];
  now?: () => Date;
  maxItems?: number;
}

const hostPlatform = (url: string | null): "facebook" | "instagram" | "website" => {
  if (!url) return "website";
  if (/instagram\.com/i.test(url)) return "instagram";
  if (/facebook\.com|fb\.com/i.test(url)) return "facebook";
  return "website";
};

function placeIdForCity(city: string | null): string {
  const t = city ? fold(city) : "";
  return PLACES.find((p) => fold(p.name) === t)?.id ?? placesOf("NI")[0]!.id;
}

/** Credenciales de Meta guardadas (cifradas en BD) o, como atajo de desarrollo, variables de entorno. */
async function loadCredentials(db: Db): Promise<{ facebook?: Credential & { connId?: string }; instagram?: Credential & { connId?: string } }> {
  const out: { facebook?: Credential & { connId?: string }; instagram?: Credential & { connId?: string } } = {};
  try {
    const fb = await getCredential(db, "facebook");
    if (fb) out.facebook = { externalId: fb.externalId, token: fb.token, connId: fb.id };
    const ig = await getCredential(db, "instagram");
    if (ig) out.instagram = { externalId: ig.externalId, token: ig.token, connId: ig.id };
  } catch {
    /* sin TOKEN_ENCRYPTION_KEY o token ilegible: se trata como sin credenciales */
  }
  if (!out.facebook && process.env.META_FB_TOKEN) out.facebook = { externalId: "env", token: process.env.META_FB_TOKEN };
  if (!out.instagram && process.env.META_IG_TOKEN && process.env.META_IG_USER_ID) out.instagram = { externalId: process.env.META_IG_USER_ID, token: process.env.META_IG_TOKEN };
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Persistencia de candidatos: deduplicación entre fuentes y conservación de TODAS las fuentes.
 * ---------------------------------------------------------------------------------------------- */
export async function persistCandidate(
  db: Db,
  c: EventCandidate,
  opts: { sourceName: string; publishLow?: boolean; publishAll?: boolean; ownerId?: string | null },
): Promise<{ id: string; created: boolean; slug: string; status: string }> {
  const place = getPlace(c.placeId)!;
  const tz = place.timezone;
  const day = dayKey(c.startsAt.toISOString(), tz);
  const lo = new Date(c.startsAt.getTime() - 36 * 3_600_000);
  const hi = new Date(c.startsAt.getTime() + 36 * 3_600_000);
  const owner = opts.ownerId ?? null;
  // Un candidato privado solo se compara con eventos públicos o del mismo dueño; uno público, con cualquiera.
  const visible = owner ? or(isNull(events.ownerId), eq(events.ownerId, owner)) : undefined;
  const nearby = await db.select().from(events).where(and(eq(events.placeId, c.placeId), gte(events.startsAt, lo), lt(events.startsAt, hi), visible));

  const match = nearby.find((e) =>
    isDuplicate(
      { title: c.title, startsAt: c.startsAt, venue: c.venue, placeId: c.placeId, organizer: c.organizer, hasTime: c.hasTime },
      { title: e.title, startsAt: e.startsAt, venue: e.venueName, placeId: e.placeId, organizer: e.organizerName ?? undefined },
      dayKey(e.startsAt.toISOString(), tz) === day,
    ),
  );

  const platform = hostPlatform(c.originalPostUrl ?? c.profileUrl);
  const srcRow = {
    sourceId: c.sourceId,
    sourceName: opts.sourceName,
    platform,
    urlKind: (c.originalPostUrl ? "EVENT_SOURCE_URL" : "PROFILE_URL") as "EVENT_SOURCE_URL" | "PROFILE_URL",
    originalPostUrl: c.originalPostUrl,
    profileUrl: c.profileUrl,
  };

  if (match && owner && !match.ownerId) {
    // Ya es un evento público: una fuente privada no se añade (no se revela ni se expone en una página pública).
    return { id: match.id, created: false, slug: match.slug, status: match.status };
  }
  if (match) {
    // Mismo evento visto en otra fuente: se agrega la fuente, no se crea un duplicado ni se pierde la alternativa.
    await db.insert(eventSources).values({ eventId: match.id, ...srcRow }).onConflictDoNothing();
    const patch: Partial<typeof events.$inferInsert> = { lastVerifiedAt: new Date() };
    if (match.ownerId && !owner) patch.ownerId = null; // una fuente pública lo encontró: deja de ser privado
    if (!match.image && c.image) patch.image = { url: c.image.url, source: c.image.source };
    if (match.venueName === "Lugar por confirmar" && c.venue !== "Lugar por confirmar") patch.venueName = c.venue;
    await db.update(events).set(patch).where(eq(events.id, match.id));
    return { id: match.id, created: false, slug: match.slug, status: match.status };
  }

  const base = `${slugify(c.title)}-${slugify(c.venue)}-${day}`;
  const clash = await db.select({ id: events.id }).from(events).where(eq(events.slug, base));
  const slug = clash.length ? `${base}-${newId().slice(0, 6)}` : base;
  const id = newId();
  const status = c.confidence === "LOW" && !opts.publishLow ? "PENDING" : "PUBLISHED";
  await db.insert(events).values({
    id, slug, title: c.title, description: c.description, category: c.category, startsAt: c.startsAt, endsAt: c.endsAt ?? null, timezone: tz,
    venueName: c.venue, organizerName: c.organizer ?? null, placeId: c.placeId, country: place.country, address: c.address ?? null, lat: c.lat ?? null, lng: c.lng ?? null,
    isFree: c.price.isFree, currency: c.price.currency ?? null, priceMin: c.price.min ?? null, priceMax: c.price.max ?? null, priceNote: c.price.note ?? null,
    image: c.image ? { url: c.image.url, source: c.image.source } : null,
    confidence: c.confidence, status, isMock: false, ownerId: owner,
    dedupeKey: dedupeKey({ title: c.title, dayKey: day, venue: c.venue }), discoveredAt: c.discoveredAt, lastVerifiedAt: c.discoveredAt,
  });
  await db.insert(eventSources).values({ eventId: id, ...srcRow });
  return { id, created: true, slug, status };
}

/** Convierte contenido crudo en candidatos usando el contexto de la fuente. */
export function candidatesFromContents(contents: SourceContent[], source: Pick<SourceRow, "type" | "name" | "city">, now: Date): EventCandidate[] {
  const placeId = placeIdForCity(source.city);
  const timeZone = getPlace(placeId)!.timezone;
  const isVenue = ["venue", "mall", "cultural"].includes(source.type);
  const out: EventCandidate[] = [];
  for (const c of contents) {
    const cand = extractCandidate(c, { now, timeZone, defaultPlaceId: placeId, defaultVenue: isVenue ? source.name : undefined, organizer: isVenue ? undefined : source.name, sourceName: source.name });
    if (cand) out.push(cand);
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Revisión de una fuente
 * ---------------------------------------------------------------------------------------------- */
export async function checkOne(deps: DiscoveryDeps, s: SourceRow, runId?: string): Promise<{ check: CheckRow; newEvents: number }> {
  const { db } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const startedAt = new Date();
  const fetcher = deps.fetcher ?? createSafeFetcher();
  const creds = await loadCredentials(db);
  const src: DiscoverySource = { id: s.id, name: s.name, type: s.type, city: s.city, urls: s.urls, verification: s.verification };

  const result = await checkSourceContent(src, deps.adapters ?? defaultAdapters(), {
    now, maxItems: deps.maxItems ?? 15, fetcher, graphVersion: process.env.META_GRAPH_VERSION,
    credentials: { facebook: creds.facebook, instagram: creds.instagram },
  });

  // Errores de token: se anotan en la conexión para que el admin la reconecte.
  if (result.status === "AUTH_REQUIRED") {
    for (const c of [creds.facebook, creds.instagram]) if (c?.connId) await markConnectionError(db, c.connId, "Token inválido o vencido").catch(() => {});
  }

  const cands = candidatesFromContents(result.contents, s, now);
  let created = 0;
  for (const c of cands) {
    const r = await persistCandidate(db, c, { sourceName: s.name, ownerId: s.ownerId, publishLow: !!s.ownerId });
    if (r.created) created++;
  }

  // Fuentes nuevas sugeridas por lo que apareció en la revisión (nunca se aprueban solas).
  if (result.discoveredLinks?.length && !s.ownerId) {
    const known = await db.select({ urls: sources.urls }).from(sources);
    const pending = await db.select({ urls: sourceCandidates.urls }).from(sourceCandidates);
    for (const l of newLinksOnly(result.discoveredLinks.filter((x) => x.platform !== "website"), [...known, ...pending])) {
      await createCandidate(db, {
        name: l.handle ?? l.url, city: s.city, category: null, discoveredFrom: `${s.name}: ${l.context ?? "enlace"}`, confidence: "LOW",
        urls: { website: null, facebook: l.platform === "facebook" ? l.url : null, instagram: l.platform === "instagram" ? l.url : null, tiktok: null },
      });
    }
  }

  let status = result.status;
  let message = result.message;
  if (status === "SUCCESS" && cands.length === 0) {
    status = "NO_EVENTS";
    message = `${result.postsReviewed} elemento(s) revisado(s), ninguno con un evento verificable. ${message}`;
  } else if (cands.length) {
    message = `${cands.length} evento(s) detectado(s) (${created} nuevo(s)). ${message}`;
  }
  const check = await recordCheck(db, { sourceId: s.id, runId, startedAt, status, postsReviewed: result.postsReviewed, eventsFound: cands.length, message: message.slice(0, 1000) });
  return { check, newEvents: created };
}

export interface RunOptions {
  sourceIds?: string[];
  startedBy?: string;
  /** Solo fuentes no revisadas en las últimas N horas (las corridas de cron se continúan solas). */
  skipCheckedWithinHours?: number;
  /** Incluir las fuentes privadas de los usuarios (cron). Las corridas manuales del admin solo revisan el catálogo global. */
  includePrivate?: boolean;
  /** Presupuesto de tiempo: al agotarse se detiene y el resto queda para la siguiente ejecución. */
  budgetMs?: number;
}

export async function runDiscovery(deps: DiscoveryDeps, trigger: "CRON" | "MANUAL", opts: RunOptions = {}) {
  const { db } = deps;
  const run = await createRun(db, trigger, opts.startedBy);
  const now = (deps.now ?? (() => new Date()))();
  const srcs = await listActiveSources(db, opts.sourceIds, { includePrivate: opts.includePrivate, staleBefore: opts.skipCheckedWithinHours ? new Date(now.getTime() - opts.skipCheckedWithinHours * 3_600_000) : undefined });
  const t0 = Date.now();
  let found = 0, fresh = 0, errors = 0, checked = 0;
  for (const s of srcs) {
    if (opts.budgetMs && Date.now() - t0 > opts.budgetMs) break;
    checked++;
    try {
      const { check, newEvents } = await checkOne(deps, s, run.id);
      found += check.eventsFound;
      fresh += newEvents;
      if (check.status === "ERROR") errors++;
    } catch (e) {
      // Un fallo inesperado en una fuente no detiene la corrida ni la deja sin registrar.
      await recordCheck(db, { sourceId: s.id, runId: run.id, status: "ERROR", message: `Fallo inesperado: ${(e as Error).message}`.slice(0, 500) });
      errors++;
    }
  }
  return { ...(await completeRun(db, run.id, { sourcesChecked: checked, eventsFound: found, newEvents: fresh, errors })), pending: srcs.length - checked };
}
