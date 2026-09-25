import { and, asc, eq, sql } from "drizzle-orm";
import type { Page } from "@turistero/schemas";
import type { Db } from "./client";
import { accounts, savedFilters, users } from "./schema";
import { newId } from "./sources";

export type UserRow = typeof users.$inferSelect;
export type Role = UserRow["role"];

export interface SyncProfile {
  provider: string;
  providerAccountId: string;
  email?: string | null;
  /** true solo si el proveedor garantiza que el correo está verificado (p. ej. Google). */
  emailVerified?: boolean;
  name?: string | null;
  image?: string | null;
}

/**
 * Crea o recupera el usuario tras un login OAuth. Reglas de seguridad:
 *  - se identifica primero por (provider, providerAccountId);
 *  - solo se vincula por correo a un usuario existente si el correo viene VERIFICADO por el proveedor;
 *  - ADMIN_EMAILS solo concede ADMIN con correo verificado (evita tomar el rol con un correo no verificado de Facebook).
 * No se guardan tokens OAuth: en esta fase el login solo necesita identidad.
 */
export async function syncUser(db: Db, p: SyncProfile, adminEmails: string[] = []): Promise<UserRow> {
  const email = p.email?.trim().toLowerCase() || null;
  const isAdminEmail = !!email && !!p.emailVerified && adminEmails.map((e) => e.toLowerCase()).includes(email);

  const [linked] = await db
    .select({ u: users })
    .from(accounts)
    .innerJoin(users, eq(accounts.userId, users.id))
    .where(and(eq(accounts.provider, p.provider), eq(accounts.providerAccountId, p.providerAccountId)));

  let user = linked?.u;
  if (!user && email && p.emailVerified) {
    user = (await db.select().from(users).where(eq(users.email, email)))[0];
    // Anti "pre-secuestro": si esa cuenta existía con contraseña pero su correo nunca se verificó, quien la creó pudo no ser
    // el dueño del correo. Al reclamarla el dueño real (correo verificado por el proveedor) se invalida la contraseña.
    if (user?.passwordHash && !user.emailVerified) {
      await db.update(users).set({ passwordHash: null, failedLogins: 0, lockedUntil: null }).where(eq(users.id, user.id));
    }
  }
  if (!user) {
    // Si el correo ya existe pero no está verificado por este proveedor, se crea el usuario sin correo (no se secuestra la cuenta).
    const taken = email ? (await db.select({ id: users.id }).from(users).where(eq(users.email, email))).length > 0 : false;
    [user] = await db
      .insert(users)
      .values({ id: newId(), email: taken ? null : email, name: p.name ?? null, image: p.image ?? null, role: isAdminEmail ? "ADMIN" : "USER", emailVerified: p.emailVerified ? new Date() : null })
      .returning();
  } else {
    const set: Partial<typeof users.$inferInsert> = { name: user.name ?? p.name ?? null, image: p.image ?? user.image };
    if (isAdminEmail && user.role !== "ADMIN") set.role = "ADMIN";
    [user] = await db.update(users).set(set).where(eq(users.id, user.id)).returning();
  }
  if (!linked) {
    await db.insert(accounts).values({ userId: user!.id, type: "oauth", provider: p.provider, providerAccountId: p.providerAccountId }).onConflictDoNothing();
  }
  return user!;
}

export async function getUser(db: Db, id: string): Promise<UserRow | null> {
  return (await db.select().from(users).where(eq(users.id, id)))[0] ?? null;
}

export async function listUsers(db: Db, page: number, pageSize: number): Promise<Page<UserRow>> {
  const [rows, c] = await Promise.all([
    db.select().from(users).orderBy(asc(users.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ n: sql<number>`count(*)::int` }).from(users),
  ]);
  return { items: rows, page, pageSize, total: c[0]?.n ?? 0 };
}

/** Cambia el rol. Rechaza dejar el sistema sin ningún ADMIN. */
export async function setRole(db: Db, id: string, role: Role): Promise<UserRow | "not-found" | "last-admin"> {
  const u = await getUser(db, id);
  if (!u) return "not-found";
  if (u.role === "ADMIN" && role !== "ADMIN") {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(eq(users.role, "ADMIN"));
    if (n <= 1) return "last-admin";
  }
  return (await db.update(users).set({ role }).where(eq(users.id, id)).returning())[0]!;
}

/* ---------- filtros guardados ---------- */
export const listSavedFilters = (db: Db, userId: string) =>
  db.select().from(savedFilters).where(eq(savedFilters.userId, userId)).orderBy(asc(savedFilters.createdAt));

export async function createSavedFilter(db: Db, userId: string, name: string, query: Record<string, string>) {
  return (await db.insert(savedFilters).values({ id: newId(), userId, name, query }).returning())[0]!;
}

export async function deleteSavedFilter(db: Db, userId: string, id: string): Promise<boolean> {
  return (await db.delete(savedFilters).where(and(eq(savedFilters.id, id), eq(savedFilters.userId, userId))).returning({ id: savedFilters.id })).length > 0;
}
