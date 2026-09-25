import { and, asc, desc, eq, exists, gte, inArray, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import type { EventItem } from "@turistero/types";
import { CATEGORIES, PLACES, getPlace, placesOf, resolveRange } from "@turistero/config";
import type { EventQueryInput, Page } from "@turistero/schemas";
import type { Db } from "./client";
import { eventSources, events, favorites } from "./schema";

type EventRow = typeof events.$inferSelect;
type EventSourceRow = typeof eventSources.$inferSelect;

export function toEventItem(r: EventRow, srcs: EventSourceRow[]): EventItem {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    category: r.category as EventItem["category"],
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt?.toISOString(),
    timezone: r.timezone,
    venue: r.venueName,
    placeId: r.placeId,
    country: r.country,
    address: r.address ?? undefined,
    lat: r.lat ?? undefined,
    lng: r.lng ?? undefined,
    organizer: r.organizerName ? { name: r.organizerName, profileUrl: r.organizerUrl ?? undefined } : undefined,
    price: { isFree: r.isFree, currency: r.currency ?? undefined, min: r.priceMin ?? undefined, max: r.priceMax ?? undefined, note: r.priceNote ?? undefined },
    image: r.image ?? undefined,
    confidence: r.confidence,
    status: r.status,
    discoveredAt: r.discoveredAt.toISOString(),
    lastVerifiedAt: r.lastVerifiedAt.toISOString(),
    isMock: r.isMock,
    sources: srcs.map((s) => ({
      sourceId: s.sourceId,
      sourceName: s.sourceName,
      platform: s.platform,
      urlKind: s.urlKind,
      originalPostUrl: s.originalPostUrl,
      profileUrl: s.profileUrl,
    })),
  };
}

async function hydrate(db: Db, rows: EventRow[]): Promise<EventItem[]> {
  if (!rows.length) return [];
  const srcs = await db.select().from(eventSources).where(inArray(eventSources.eventId, rows.map((r) => r.id)));
  const byEvent = new Map<string, EventSourceRow[]>();
  for (const s of srcs) byEvent.set(s.eventId, [...(byEvent.get(s.eventId) ?? []), s]);
  return rows.map((r) => toEventItem(r, byEvent.get(r.id) ?? []));
}

function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
/** Columna sin acentos ni mayúsculas para comparar contra términos normalizados. */
const plain = (col: unknown) => sql`translate(lower(${col}), 'áéíóúüñ', 'aeiouun')`;

export function tzFor(country: string, city?: string): string {
  return (city && getPlace(city)?.timezone) || placesOf(country)[0]?.timezone || "UTC";
}

export interface ListOpts {
  includeAll?: boolean;
  now?: Date;
  /** Usuario que consulta: además de lo público ve sus eventos privados. */
  viewerId?: string;
  /** Agenda personal: solo eventos de estas fuentes (privadas + suscritas) o propios. */
  mineSourceIds?: string[];
}

export async function listEvents(db: Db, q: EventQueryInput, opts: ListOpts = {}): Promise<Page<EventItem>> {
  const now = opts.now ?? new Date();
  const country = q.country ?? "NI";
  const range = resolveRange(q.range, now, tzFor(country, q.city), { from: q.from, to: q.to });
  const where: (SQL | undefined)[] = [eq(events.country, country), gte(events.startsAt, range.from), lt(events.startsAt, range.to)];

  if (opts.includeAll) {
    if (q.status) where.push(eq(events.status, q.status));
    if (q.confidence) where.push(eq(events.confidence, q.confidence));
    // Ni siquiera el personal de moderación ve los eventos privados de otros usuarios.
    where.push(opts.viewerId ? or(isNull(events.ownerId), eq(events.ownerId, opts.viewerId)) : isNull(events.ownerId));
  } else {
    // Público: PUBLISHED con confianza HIGH/MEDIUM. Los eventos de fuentes privadas los ve solo su dueño (también los LOW, rotulados).
    const publicCond = and(eq(events.status, "PUBLISHED"), ne(events.confidence, "LOW"), isNull(events.ownerId));
    const ownCond = opts.viewerId ? and(eq(events.ownerId, opts.viewerId), ne(events.status, "HIDDEN")) : undefined;
    where.push(or(publicCond, ownCond));
  }
  if (opts.mineSourceIds) {
    const own = opts.viewerId ? eq(events.ownerId, opts.viewerId) : undefined;
    where.push(
      or(
        own,
        opts.mineSourceIds.length
          ? exists(db.select({ x: sql`1` }).from(eventSources).where(and(eq(eventSources.eventId, events.id), inArray(eventSources.sourceId, opts.mineSourceIds))))
          : undefined,
      ),
    );
  }
  if (q.city) where.push(eq(events.placeId, q.city));
  if (q.category) where.push(eq(events.category, q.category));
  if (q.price === "free") where.push(eq(events.isFree, true));
  if (q.price === "paid") where.push(eq(events.isFree, false));

  const terms = q.q ? norm(q.q).split(/\s+/).filter(Boolean) : [];
  for (const t of terms) {
    const like = `%${t.replace(/[%_\\]/g, "\\$&")}%`;
    const placeIds = PLACES.filter((p) => norm(p.name).includes(t)).map((p) => p.id);
    const catIds = CATEGORIES.filter((c) => norm(c.label).includes(t) || norm(c.short).includes(t) || c.id === t).map((c) => c.id);
    where.push(
      or(
        sql`${plain(events.title)} like ${like}`,
        sql`${plain(events.description)} like ${like}`,
        sql`${plain(events.venueName)} like ${like}`,
        sql`${plain(sql`coalesce(${events.organizerName}, '')`)} like ${like}`,
        placeIds.length ? inArray(events.placeId, placeIds) : undefined,
        catIds.length ? inArray(events.category, catIds) : undefined,
        exists(db.select({ x: sql`1` }).from(eventSources).where(and(eq(eventSources.eventId, events.id), sql`${plain(eventSources.sourceName)} like ${like}`))),
      ),
    );
  }

  const filter = and(...where);
  const order =
    q.sort === "new"
      ? [desc(events.discoveredAt)]
      : q.sort === "relevance" && terms.length
        ? [sql`case when ${plain(events.title)} like ${"%" + terms[0] + "%"} then 0 else 1 end`, asc(events.startsAt)]
        : [asc(events.startsAt)];

  const [rows, count] = await Promise.all([
    db.select().from(events).where(filter).orderBy(...order).limit(q.pageSize).offset((q.page - 1) * q.pageSize),
    db.select({ n: sql<number>`count(*)::int` }).from(events).where(filter),
  ]);
  return { items: await hydrate(db, rows), page: q.page, pageSize: q.pageSize, total: count[0]?.n ?? 0 };
}

export async function getEvent(db: Db, idOrSlug: string, opts: { includeAll?: boolean; viewerId?: string } = {}): Promise<EventItem | null> {
  const [row] = await db.select().from(events).where(or(eq(events.id, idOrSlug), eq(events.slug, idOrSlug))).limit(1);
  if (!row || (!opts.includeAll && row.status !== "PUBLISHED")) return null;
  if (row.ownerId && row.ownerId !== opts.viewerId) return null; // evento privado de otro usuario (incluye al personal de moderación)
  return (await hydrate(db, [row]))[0] ?? null;
}

export async function updateEvent(db: Db, id: string, patch: Record<string, unknown>): Promise<EventItem | null> {
  const set: Partial<typeof events.$inferInsert> = { lastVerifiedAt: new Date() };
  const p = patch as {
    title?: string; description?: string; category?: string; venue?: string; address?: string | null;
    status?: "PUBLISHED" | "PENDING" | "HIDDEN"; confidence?: "HIGH" | "MEDIUM" | "LOW"; startsAt?: string; endsAt?: string | null;
  };
  if (p.title !== undefined) set.title = p.title;
  if (p.description !== undefined) set.description = p.description;
  if (p.category !== undefined) set.category = p.category;
  if (p.venue !== undefined) set.venueName = p.venue;
  if (p.address !== undefined) set.address = p.address;
  if (p.status !== undefined) set.status = p.status;
  if (p.confidence !== undefined) set.confidence = p.confidence;
  if (p.startsAt !== undefined) set.startsAt = new Date(p.startsAt);
  if (p.endsAt !== undefined) set.endsAt = p.endsAt ? new Date(p.endsAt) : null;
  const [row] = await db.update(events).set(set).where(eq(events.id, id)).returning();
  return row ? (await hydrate(db, [row]))[0]! : null;
}

/* ---------- favoritos ---------- */
export async function listFavorites(db: Db, userId: string, page: number, pageSize: number): Promise<Page<EventItem>> {
  const on = eq(favorites.userId, userId);
  const [rows, count] = await Promise.all([
    db.select({ e: events }).from(favorites).innerJoin(events, eq(favorites.eventId, events.id)).where(on).orderBy(asc(events.startsAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ n: sql<number>`count(*)::int` }).from(favorites).where(on),
  ]);
  return { items: await hydrate(db, rows.map((r) => r.e)), page, pageSize, total: count[0]?.n ?? 0 };
}

export async function addFavorite(db: Db, userId: string, eventId: string): Promise<boolean> {
  const ev = await getEvent(db, eventId, { viewerId: userId });
  if (!ev) return false;
  await db.insert(favorites).values({ userId, eventId: ev.id }).onConflictDoNothing();
  return true;
}

export async function removeFavorite(db: Db, userId: string, eventId: string): Promise<void> {
  await db.delete(favorites).where(and(eq(favorites.userId, userId), eq(favorites.eventId, eventId)));
}

/**
 * Fusiona un evento duplicado en otro: las fuentes y favoritos pasan al evento destino
 * (nunca se pierde una fuente alternativa) y el duplicado se elimina.
 */
export async function mergeEvents(db: Db, fromId: string, intoId: string): Promise<EventItem | "not-found" | "same"> {
  if (fromId === intoId) return "same";
  const [from, into] = await Promise.all([
    db.select().from(events).where(eq(events.id, fromId)),
    db.select().from(events).where(eq(events.id, intoId)),
  ]);
  if (!from[0] || !into[0]) return "not-found";
  const srcs = await db.select().from(eventSources).where(eq(eventSources.eventId, fromId));
  if (srcs.length) await db.insert(eventSources).values(srcs.map((s) => ({ ...s, eventId: intoId }))).onConflictDoNothing();
  const favs = await db.select().from(favorites).where(eq(favorites.eventId, fromId));
  if (favs.length) await db.insert(favorites).values(favs.map((f) => ({ ...f, eventId: intoId }))).onConflictDoNothing();
  const patch: Partial<typeof events.$inferInsert> = { lastVerifiedAt: new Date() };
  if (!into[0].image && from[0].image) patch.image = from[0].image;
  if (from[0].discoveredAt < into[0].discoveredAt) patch.discoveredAt = from[0].discoveredAt;
  await db.update(events).set(patch).where(eq(events.id, intoId));
  await db.delete(events).where(eq(events.id, fromId)); // cascada: event_source y favorite del duplicado
  return (await getEvent(db, intoId, { includeAll: true }))!;
}
