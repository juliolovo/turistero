import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "./client";
import { notifications, userSchedules, users } from "./schema";
import { newId } from "./sources";

export interface Schedule { enabled: boolean; days: number[]; hour: number; minute: number; timezone: string; lastRunAt: Date | null }
export const DEFAULT_SCHEDULE = { enabled: true, days: [1, 3, 5], hour: 5, minute: 15 };

export async function getSchedule(db: Db, userId: string): Promise<Schedule> {
  const [[row], [u]] = await Promise.all([
    db.select().from(userSchedules).where(eq(userSchedules.userId, userId)),
    db.select({ tz: users.timezone }).from(users).where(eq(users.id, userId)),
  ]);
  return {
    ...(row ? { enabled: row.enabled, days: row.days, hour: row.hour, minute: row.minute } : DEFAULT_SCHEDULE),
    timezone: u?.tz ?? "America/Managua",
    lastRunAt: row?.lastRunAt ?? null,
  };
}

export async function setSchedule(db: Db, userId: string, s: { enabled: boolean; days: number[]; hour: number; minute: number; timezone?: string }): Promise<Schedule> {
  const days = [...new Set(s.days)].filter((d) => d >= 0 && d <= 6).sort();
  await db
    .insert(userSchedules)
    .values({ userId, enabled: s.enabled, days, hour: s.hour, minute: s.minute })
    .onConflictDoUpdate({ target: userSchedules.userId, set: { enabled: s.enabled, days, hour: s.hour, minute: s.minute } });
  if (s.timezone) await db.update(users).set({ timezone: s.timezone }).where(eq(users.id, userId));
  return getSchedule(db, userId);
}

export async function markScheduleRun(db: Db, userId: string, at: Date) {
  await db.insert(userSchedules).values({ userId, lastRunAt: at }).onConflictDoUpdate({ target: userSchedules.userId, set: { lastRunAt: at } });
}

/** Usuarios con fuentes propias activas y su horario (quien no lo configuró usa el predeterminado). */
export async function usersWithPrivateSources(db: Db): Promise<{ userId: string; schedule: Schedule }[]> {
  const rows = await db.execute(sql`select distinct owner_id as id from source where owner_id is not null and active = true`);
  const list = (Array.isArray(rows) ? rows : (rows as { rows: { id: string }[] }).rows) as { id: string }[];
  return Promise.all(list.map(async (r) => ({ userId: r.id, schedule: await getSchedule(db, r.id) })));
}

/* ---------- avisos ---------- */
export type NotificationKind = "SCAN_STARTED" | "NEW_EVENTS" | "SCAN_FAILED" | "INFO";

export async function notify(db: Db, userId: string, kind: NotificationKind, message: string, sourceId?: string) {
  await db.insert(notifications).values({ id: newId(), userId, kind, message: message.slice(0, 500), sourceId: sourceId ?? null });
}

export const listNotifications = (db: Db, userId: string, limit = 30) =>
  db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);

export async function unreadCount(db: Db, userId: string): Promise<number> {
  const rows = await db.select({ n: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return rows[0]?.n ?? 0;
}

export async function markAllRead(db: Db, userId: string) {
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
