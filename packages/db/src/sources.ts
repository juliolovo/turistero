import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import type { Page, SourceInput, SourcesFile } from "@turistero/schemas";
import type { Db } from "./client";
import { discoveryRuns, sourceCandidates, sourceChecks, sources } from "./schema";

export type SourceRow = typeof sources.$inferSelect;
export type CheckRow = typeof sourceChecks.$inferSelect;
export type RunRow = typeof discoveryRuns.$inferSelect;
export type CandidateRow = typeof sourceCandidates.$inferSelect;

export const newId = () => crypto.randomUUID();

export function rowToSource(r: SourceRow): SourceInput {
  return {
    id: r.id, name: r.name, aliases: r.aliases, type: r.type, country: r.country, city: r.city, categories: r.categories,
    active: r.active, priority: r.priority, urls: r.urls, verification: r.verification,
    lastReviewedAt: r.lastReviewedAt?.toISOString() ?? null, notes: r.notes,
  };
}

function toValues(s: Omit<SourceInput, "lastReviewedAt"> & { lastReviewedAt?: string | null }) {
  return {
    id: s.id, name: s.name, aliases: s.aliases, type: s.type, country: s.country, city: s.city, categories: s.categories,
    active: s.active, priority: s.priority, urls: s.urls, verification: s.verification, notes: s.notes,
    lastReviewedAt: s.lastReviewedAt ? new Date(s.lastReviewedAt) : null,
  };
}

/** Catálogo global (ownerId nulo). Las fuentes privadas de usuario llegan en Fase 3. */
export async function listSources(db: Db, o: { page: number; pageSize: number; city?: string; active?: boolean; q?: string }): Promise<Page<SourceInput>> {
  const cond = and(
    isNull(sources.ownerId),
    o.city ? ilike(sources.city, o.city) : undefined,
    o.active === undefined ? undefined : eq(sources.active, o.active),
    o.q ? or(ilike(sources.name, `%${o.q}%`), sql`exists (select 1 from unnest(${sources.aliases}) a where a ilike ${"%" + o.q + "%"})`) : undefined,
  );
  const [rows, c] = await Promise.all([
    db.select().from(sources).where(cond).orderBy(desc(sources.priority), asc(sources.name)).limit(o.pageSize).offset((o.page - 1) * o.pageSize),
    db.select({ n: sql<number>`count(*)::int` }).from(sources).where(cond),
  ]);
  return { items: rows.map(rowToSource), page: o.page, pageSize: o.pageSize, total: c[0]?.n ?? 0 };
}

export async function getSourceRow(db: Db, id: string) {
  return (await db.select().from(sources).where(eq(sources.id, id)).limit(1))[0] ?? null;
}

export async function createSource(db: Db, s: Omit<SourceInput, "lastReviewedAt">): Promise<SourceInput | "exists"> {
  if (await getSourceRow(db, s.id)) return "exists";
  const [row] = await db.insert(sources).values(toValues(s)).returning();
  return rowToSource(row!);
}

export async function patchSource(db: Db, id: string, p: Partial<Omit<SourceInput, "id" | "lastReviewedAt">>): Promise<SourceInput | null> {
  if (!Object.keys(p).length) return rowToSource((await getSourceRow(db, id))!);
  const [row] = await db.update(sources).set({ ...p, updatedAt: new Date() }).where(eq(sources.id, id)).returning();
  return row ? rowToSource(row) : null;
}

export async function deleteSource(db: Db, id: string): Promise<boolean> {
  return (await db.delete(sources).where(eq(sources.id, id)).returning({ id: sources.id })).length > 0;
}

/** Export completo del catálogo global en el formato de config/sources.json. */
export async function exportSources(db: Db): Promise<SourcesFile> {
  const rows = await db.select().from(sources).where(isNull(sources.ownerId)).orderBy(desc(sources.priority), asc(sources.name));
  return { version: 1, sources: rows.map(rowToSource) };
}

/** Import: `merge` no pisa campos ya existentes de fuentes conocidas; `replace-matching` sobrescribe las que coinciden por id. */
export async function importSources(db: Db, file: SourcesFile, mode: "merge" | "replace-matching") {
  let created = 0, updated = 0, skipped = 0;
  for (const s of file.sources) {
    const existing = await getSourceRow(db, s.id);
    if (!existing) {
      await db.insert(sources).values(toValues(s));
      created++;
    } else if (mode === "replace-matching") {
      await db.update(sources).set({ ...toValues(s), lastReviewedAt: existing.lastReviewedAt, updatedAt: new Date() }).where(eq(sources.id, s.id));
      updated++;
    } else skipped++;
  }
  return { created, updated, skipped };
}

/* ---------- auditoría ---------- */
export async function recordCheck(
  db: Db,
  c: { sourceId: string; runId?: string | null; status: CheckRow["status"]; postsReviewed?: number; eventsFound?: number; message?: string; startedAt?: Date },
): Promise<CheckRow> {
  const finishedAt = new Date();
  const [row] = await db
    .insert(sourceChecks)
    .values({ id: newId(), sourceId: c.sourceId, runId: c.runId ?? null, startedAt: c.startedAt ?? finishedAt, finishedAt, status: c.status, postsReviewed: c.postsReviewed ?? 0, eventsFound: c.eventsFound ?? 0, message: c.message ?? "" })
    .returning();
  await db.update(sources).set({ lastReviewedAt: finishedAt }).where(eq(sources.id, c.sourceId));
  return row!;
}

export async function listChecks(db: Db, sourceId: string, page: number, pageSize: number): Promise<Page<CheckRow>> {
  const on = eq(sourceChecks.sourceId, sourceId);
  const [rows, c] = await Promise.all([
    db.select().from(sourceChecks).where(on).orderBy(desc(sourceChecks.startedAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ n: sql<number>`count(*)::int` }).from(sourceChecks).where(on),
  ]);
  return { items: rows, page, pageSize, total: c[0]?.n ?? 0 };
}

/** Último chequeo por fuente (para /admin/sources/status). */
export async function latestChecks(db: Db): Promise<CheckRow[]> {
  const res = await db.execute(sql`select distinct on (source_id) * from source_check order by source_id, started_at desc`);
  const rows = (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as string, sourceId: r.source_id as string, runId: (r.run_id as string) ?? null,
    startedAt: new Date(r.started_at as string), finishedAt: r.finished_at ? new Date(r.finished_at as string) : null,
    status: r.status as CheckRow["status"], postsReviewed: r.posts_reviewed as number, eventsFound: r.events_found as number, message: r.message as string,
  }));
}

export async function createRun(db: Db, trigger: "CRON" | "MANUAL", startedBy?: string): Promise<RunRow> {
  const [row] = await db.insert(discoveryRuns).values({ id: newId(), trigger, startedBy: startedBy ?? null }).returning();
  return row!;
}

export async function completeRun(db: Db, id: string, r: { sourcesChecked: number; eventsFound: number; newEvents: number; errors: number }): Promise<RunRow> {
  const status = r.errors === 0 ? "COMPLETED" : r.errors >= r.sourcesChecked ? "FAILED" : "PARTIAL";
  const [row] = await db.update(discoveryRuns).set({ ...r, status, completedAt: new Date() }).where(eq(discoveryRuns.id, id)).returning();
  return row!;
}

export async function listRuns(db: Db, page: number, pageSize: number): Promise<Page<RunRow>> {
  const [rows, c] = await Promise.all([
    db.select().from(discoveryRuns).orderBy(desc(discoveryRuns.startedAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ n: sql<number>`count(*)::int` }).from(discoveryRuns),
  ]);
  return { items: rows, page, pageSize, total: c[0]?.n ?? 0 };
}

export async function listActiveSources(db: Db, ids?: string[], opts: { staleBefore?: Date } = {}): Promise<SourceRow[]> {
  let rows = await db.select().from(sources).where(and(isNull(sources.ownerId), eq(sources.active, true))).orderBy(desc(sources.priority));
  if (ids?.length) rows = rows.filter((r) => ids.includes(r.id));
  if (opts.staleBefore) {
    const t = opts.staleBefore.getTime();
    // Solo las que no se revisaron recientemente; primero las que nunca se han revisado y luego las más antiguas.
    rows = rows.filter((r) => !r.lastReviewedAt || r.lastReviewedAt.getTime() < t);
    rows.sort((a, b) => (a.lastReviewedAt?.getTime() ?? 0) - (b.lastReviewedAt?.getTime() ?? 0));
  }
  return rows;
}

/** Racha de fallos consecutivos por fuente (estados que requieren atención), para el monitoreo. */
export async function failureStreaks(db: Db): Promise<Record<string, number>> {
  const rows = await db.select({ sourceId: sourceChecks.sourceId, status: sourceChecks.status }).from(sourceChecks).orderBy(desc(sourceChecks.startedAt));
  const ok = new Set(["SUCCESS", "NO_EVENTS", "NO_RECENT_CONTENT"]);
  const streak: Record<string, number> = {};
  const done = new Set<string>();
  for (const r of rows) {
    if (done.has(r.sourceId)) continue;
    if (ok.has(r.status)) done.add(r.sourceId);
    else streak[r.sourceId] = (streak[r.sourceId] ?? 0) + 1;
  }
  return streak;
}

/* ---------- candidatos ---------- */
export async function listCandidates(db: Db, page: number, pageSize: number, status?: CandidateRow["status"]): Promise<Page<CandidateRow>> {
  const on = status ? eq(sourceCandidates.status, status) : undefined;
  const [rows, c] = await Promise.all([
    db.select().from(sourceCandidates).where(on).orderBy(desc(sourceCandidates.discoveredAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ n: sql<number>`count(*)::int` }).from(sourceCandidates).where(on),
  ]);
  return { items: rows, page, pageSize, total: c[0]?.n ?? 0 };
}

export async function createCandidate(db: Db, c: Omit<typeof sourceCandidates.$inferInsert, "id" | "status" | "discoveredAt">): Promise<CandidateRow> {
  const [row] = await db.insert(sourceCandidates).values({ ...c, id: newId() }).returning();
  return row!;
}

export async function actOnCandidate(
  db: Db,
  id: string,
  a: { action: "approve"; source?: Omit<SourceInput, "lastReviewedAt"> } | { action: "reject" } | { action: "merge"; intoSourceId: string },
  by?: string,
): Promise<{ candidate: CandidateRow; source?: SourceInput } | "not-found" | "conflict" | "target-missing"> {
  const [cand] = await db.select().from(sourceCandidates).where(eq(sourceCandidates.id, id)).limit(1);
  if (!cand) return "not-found";
  if (cand.status !== "PENDING") return "conflict";
  const done = async (set: Partial<typeof sourceCandidates.$inferInsert>) =>
    (await db.update(sourceCandidates).set({ ...set, reviewedBy: by ?? null }).where(eq(sourceCandidates.id, id)).returning())[0]!;

  if (a.action === "reject") return { candidate: await done({ status: "REJECTED" }) };
  if (a.action === "merge") {
    const target = await getSourceRow(db, a.intoSourceId);
    if (!target) return "target-missing";
    // Solo se completan URLs vacías del destino; nunca se sobrescriben las existentes.
    const urls = { ...target.urls };
    for (const k of Object.keys(cand.urls) as (keyof typeof urls)[]) urls[k] = urls[k] ?? cand.urls[k] ?? null;
    await db.update(sources).set({ urls, updatedAt: new Date() }).where(eq(sources.id, target.id));
    return { candidate: await done({ status: "MERGED", mergedIntoId: target.id }) };
  }
  const slug = (a.source?.id ?? cand.name).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const created = await createSource(db, {
    id: slug, name: cand.name, aliases: [], type: "organizer", country: "NI", city: cand.city, categories: cand.category ? [cand.category] : [],
    active: true, priority: 5, urls: cand.urls, verification: {}, notes: `Aprobada desde candidato (${cand.discoveredFrom ?? "sin origen"}).`, ...a.source,
  });
  if (created === "exists") return "conflict";
  return { candidate: await done({ status: "APPROVED", mergedIntoId: created.id }), source: created };
}
