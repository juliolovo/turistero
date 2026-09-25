import { gte } from "drizzle-orm";
import { zonedParts } from "@turistero/config";
import {
  checkDecision, completeRun, createRun, listActiveSources, markScheduleRun, notify, recordCheck, sourceChecks, usersWithPrivateSources,
  type Schedule, type SourceRow, type CheckDecision,
} from "@turistero/db";
import { checkOne, isScanning, type DiscoveryDeps } from "./discovery";

/** Catálogo global: lunes, miércoles y viernes a las 05:15 America/Managua. */
export const GLOBAL_SCHEDULE = { timeZone: "America/Managua", days: [1, 3, 5], hour: 5, minute: 15 };

export function isDueToday(now: Date, s: { timeZone: string; days: number[]; hour: number; minute: number }): boolean {
  const n = zonedParts(now, s.timeZone);
  return s.days.includes(n.dow) && n.h * 60 + n.mi >= s.hour * 60 + s.minute;
}

const sameLocalDay = (a: Date, b: Date, tz: string) => {
  const x = zonedParts(a, tz), y = zonedParts(b, tz);
  return x.y === y.y && x.m === y.m && x.d === y.d;
};

/** Un usuario toca hoy si su horario está activo, hoy es uno de sus días, ya pasó la hora y aún no corrió hoy. */
export function userDue(now: Date, s: Schedule): boolean {
  if (!s.enabled) return false;
  if (!isDueToday(now, { timeZone: s.timezone, days: s.days, hour: s.hour, minute: s.minute })) return false;
  return !(s.lastRunAt && sameLocalDay(s.lastRunAt, now, s.timezone));
}

export interface TickSummary {
  run: string | null;
  checked: number;
  newEvents: number;
  errors: number;
  pending: number;
  skipped: number;
  users: number;
  globalDue: boolean;
}

/**
 * Una pasada del planificador (se puede llamar cada hora: es idempotente). Decide qué revisar:
 *  1. catálogo global si hoy es día programado (lun/mié/vie tras las 05:15 de Managua);
 *  2. fuentes propias de cada usuario según SU horario (días/hora/zona), una vez por día;
 *  3. reintentos: fuentes cuya última revisión falló por algo transitorio (1 reintento pasada 1 h).
 * Toda fuente respeta `checkDecision`: como máximo una revisión por día por fuente (+ 1 reintento tras fallo).
 * Sin navegador, sin JavaScript de terceros: solo peticiones HTTP puntuales.
 */
export async function runScheduledTick(deps: DiscoveryDeps, opts: { budgetMs?: number } = {}): Promise<TickSummary> {
  const { db } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const t0 = Date.now();

  // Historial reciente de todas las fuentes en una sola consulta
  const since = new Date(now.getTime() - 48 * 3_600_000);
  const recent = await db.select({ sourceId: sourceChecks.sourceId, startedAt: sourceChecks.startedAt, status: sourceChecks.status }).from(sourceChecks).where(gte(sourceChecks.startedAt, since));
  const bySource = new Map<string, { startedAt: Date; status: string }[]>();
  for (const c of recent) bySource.set(c.sourceId, [...(bySource.get(c.sourceId) ?? []), c]);
  const decide = (id: string): CheckDecision => checkDecision(bySource.get(id) ?? [], now);

  const work: { source: SourceRow; owner: string | null; retry: boolean }[] = [];
  const all = await listActiveSources(db, undefined, { includePrivate: true });
  const globalDue = isDueToday(now, GLOBAL_SCHEDULE);
  let skipped = 0;

  // Fuentes privadas: por horario de cada usuario
  const dueUsers = new Map<string, Schedule>();
  for (const u of await usersWithPrivateSources(db)) if (userDue(now, u.schedule)) dueUsers.set(u.userId, u.schedule);

  for (const s of all) {
    if (isScanning(s, now)) continue;
    const d = decide(s.id);
    const due = s.ownerId ? dueUsers.has(s.ownerId) : globalDue;
    if (d.ok && (due || d.retry)) work.push({ source: s, owner: s.ownerId, retry: d.retry });
    else if (due) skipped++;
  }
  // más antiguas primero (nunca revisadas al inicio)
  work.sort((a, b) => (a.source.lastReviewedAt?.getTime() ?? 0) - (b.source.lastReviewedAt?.getTime() ?? 0));

  if (!work.length) return { run: null, checked: 0, newEvents: 0, errors: 0, pending: 0, skipped, users: dueUsers.size, globalDue };

  const run = await createRun(db, "CRON");
  // Aviso "estamos revisando ahora" a cada usuario con trabajo programado
  const notified = new Set<string>();
  for (const w of work) {
    if (w.owner && !w.retry && !notified.has(w.owner)) {
      notified.add(w.owner);
      const n = work.filter((x) => x.owner === w.owner && !x.retry).length;
      await notify(db, w.owner, "SCAN_STARTED", `🔎 Estamos revisando ahora tus ${n} fuente(s) (revisión programada). Te avisamos si hay novedades.`);
    }
  }

  let checked = 0, found = 0, fresh = 0, errors = 0;
  const done = new Set<string>();
  for (const w of work) {
    if (opts.budgetMs && Date.now() - t0 > opts.budgetMs) break;
    checked++;
    done.add(w.source.id);
    try {
      const { check, newEvents } = await checkOne(deps, w.source, run.id, { trigger: "scheduled" });
      found += check.eventsFound;
      fresh += newEvents;
      if (check.status === "ERROR") errors++;
    } catch (e) {
      await recordCheck(db, { sourceId: w.source.id, runId: run.id, status: "ERROR", message: `Fallo inesperado: ${(e as Error).message}`.slice(0, 500) });
      errors++;
    }
  }
  // Usuarios cuyo horario se cumplió y cuyas fuentes ya se revisaron todas: hoy ya corrió (no se repite hasta su próximo día).
  // Si el presupuesto de tiempo cortó la pasada, el usuario sigue pendiente para la siguiente.
  for (const uid of dueUsers.keys()) {
    if (work.filter((w) => w.owner === uid && !w.retry).every((w) => done.has(w.source.id))) await markScheduleRun(db, uid, now);
  }

  await completeRun(db, run.id, { sourcesChecked: checked, eventsFound: found, newEvents: fresh, errors });
  return { run: run.id, checked, newEvents: fresh, errors, pending: work.length - checked, skipped, users: dueUsers.size, globalDue };
}

