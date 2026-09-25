import { and, asc, eq, sql } from "drizzle-orm";
import type { SourceInput } from "@turistero/schemas";
import type { Db } from "./client";
import { eventSources, events, sources, userSources } from "./schema";
import { rowToSource, type SourceRow } from "./sources";

/** Tope de fuentes privadas por usuario (evita abuso del descubrimiento automático). */
export const MAX_PRIVATE_SOURCES = 50;

export const privateSourceId = (userId: string, slug: string) => `u-${userId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8)}-${slug}`;

export interface MySources {
  private: SourceInput[];
  subscribed: { source: SourceInput; enabled: boolean; alias: string | null }[];
}

export async function listMySources(db: Db, userId: string): Promise<MySources> {
  const [mine, subs] = await Promise.all([
    db.select().from(sources).where(eq(sources.ownerId, userId)).orderBy(asc(sources.name)),
    db.select({ s: sources, enabled: userSources.enabled, alias: userSources.alias }).from(userSources).innerJoin(sources, eq(userSources.sourceId, sources.id)).where(eq(userSources.userId, userId)).orderBy(asc(sources.name)),
  ]);
  return { private: mine.map(rowToSource), subscribed: subs.map((r) => ({ source: rowToSource(r.s), enabled: r.enabled, alias: r.alias })) };
}

/** Ids de las fuentes cuyo contenido forma parte de la agenda personal: privadas + suscritas activas. */
export async function mySourceIds(db: Db, userId: string): Promise<string[]> {
  const [mine, subs] = await Promise.all([
    db.select({ id: sources.id }).from(sources).where(eq(sources.ownerId, userId)),
    db.select({ id: userSources.sourceId }).from(userSources).where(and(eq(userSources.userId, userId), eq(userSources.enabled, true))),
  ]);
  return [...mine.map((r) => r.id), ...subs.map((r) => r.id)];
}

export async function createPrivateSource(
  db: Db,
  userId: string,
  slug: string,
  s: Omit<SourceInput, "id" | "lastReviewedAt" | "verification" | "priority" | "active"> & { active?: boolean },
): Promise<SourceRow | "limit" | "exists"> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(sources).where(eq(sources.ownerId, userId)) as [{ n: number }];
  if (n >= MAX_PRIVATE_SOURCES) return "limit";
  const id = privateSourceId(userId, slug);
  if ((await db.select({ id: sources.id }).from(sources).where(eq(sources.id, id))).length) return "exists";
  const [row] = await db
    .insert(sources)
    .values({ id, name: s.name, aliases: s.aliases, type: s.type, country: s.country, city: s.city, categories: s.categories, active: s.active ?? true, priority: 5, urls: s.urls, verification: {}, notes: s.notes, ownerId: userId })
    .returning();
  return row!;
}

export async function getOwnedSource(db: Db, userId: string, id: string): Promise<SourceRow | null> {
  return (await db.select().from(sources).where(and(eq(sources.id, id), eq(sources.ownerId, userId))))[0] ?? null;
}

export async function patchPrivateSource(db: Db, userId: string, id: string, p: Partial<Pick<SourceInput, "name" | "aliases" | "type" | "country" | "city" | "categories" | "active" | "urls" | "notes">>): Promise<SourceRow | null> {
  if (!(await getOwnedSource(db, userId, id))) return null;
  if (!Object.keys(p).length) return getOwnedSource(db, userId, id);
  return (await db.update(sources).set({ ...p, updatedAt: new Date() }).where(and(eq(sources.id, id), eq(sources.ownerId, userId))).returning())[0] ?? null;
}

/** Elimina la fuente y los eventos privados que solo ella había encontrado. */
export async function deletePrivateSource(db: Db, userId: string, id: string): Promise<boolean> {
  const deleted = (await db.delete(sources).where(and(eq(sources.id, id), eq(sources.ownerId, userId))).returning({ id: sources.id })).length > 0;
  if (!deleted) return false;
  await db.delete(eventSources).where(and(eq(eventSources.sourceId, id), sql`${eventSources.eventId} in (select id from event where owner_id = ${userId})`));
  await db.delete(events).where(and(eq(events.ownerId, userId), sql`not exists (select 1 from event_source es where es.event_id = ${events.id})`));
  return true;
}

/** Suscribe (o actualiza) una fuente del catálogo global en la agenda del usuario. */
export async function setSubscription(db: Db, userId: string, sourceId: string, o: { enabled?: boolean; alias?: string | null } = {}): Promise<boolean> {
  const [src] = await db.select({ id: sources.id, ownerId: sources.ownerId }).from(sources).where(eq(sources.id, sourceId));
  if (!src || src.ownerId) return false; // solo fuentes del catálogo global
  await db
    .insert(userSources)
    .values({ userId, sourceId, enabled: o.enabled ?? true, alias: o.alias ?? null })
    .onConflictDoUpdate({ target: [userSources.userId, userSources.sourceId], set: { enabled: o.enabled ?? true, ...(o.alias !== undefined ? { alias: o.alias } : {}) } });
  return true;
}

export async function removeSubscription(db: Db, userId: string, sourceId: string): Promise<boolean> {
  return (await db.delete(userSources).where(and(eq(userSources.userId, userId), eq(userSources.sourceId, sourceId))).returning({ id: userSources.sourceId })).length > 0;
}
