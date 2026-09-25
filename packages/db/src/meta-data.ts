import { and, eq, sql } from "drizzle-orm";
import type { Db } from "./client";
import { accounts, connections, dataDeletionRequests, users } from "./schema";
import { newId } from "./sources";

/**
 * Elimina los datos asociados a un usuario de Facebook (id de la app) tras una solicitud de eliminación de Meta:
 *  - si la cuenta de Turistero solo existía por Facebook, se borra el usuario completo (cascada: favoritos, fuentes
 *    propias y sus eventos privados, avisos, horario, conexiones);
 *  - si tiene otros métodos de acceso (Google, contraseña…), solo se desvincula Facebook y se borran sus conexiones a Meta.
 */
export async function deleteFacebookUserData(db: Db, externalUserId: string): Promise<{ code: string; status: "COMPLETED" | "NOT_FOUND" }> {
  const code = newId().replace(/-/g, "").slice(0, 16);
  const [link] = await db.select().from(accounts).where(and(eq(accounts.provider, "facebook"), eq(accounts.providerAccountId, externalUserId)));
  let status: "COMPLETED" | "NOT_FOUND" = "NOT_FOUND";
  if (link) {
    const others = await db.select().from(accounts).where(and(eq(accounts.userId, link.userId), sql`${accounts.provider} <> 'facebook'`));
    const [u] = await db.select({ pw: users.passwordHash }).from(users).where(eq(users.id, link.userId));
    if (others.length === 0 && !u?.pw) {
      await db.delete(users).where(eq(users.id, link.userId));
    } else {
      await db.delete(accounts).where(and(eq(accounts.provider, "facebook"), eq(accounts.providerAccountId, externalUserId)));
      await db.delete(connections).where(eq(connections.userId, link.userId));
    }
    status = "COMPLETED";
  }
  await db.insert(dataDeletionRequests).values({ code, provider: "facebook", externalUserId, status });
  return { code, status };
}

/** El usuario quitó la app desde Facebook: se eliminan sus conexiones (tokens) pero se conserva la cuenta. */
export async function deauthorizeFacebookUser(db: Db, externalUserId: string): Promise<boolean> {
  const [link] = await db.select().from(accounts).where(and(eq(accounts.provider, "facebook"), eq(accounts.providerAccountId, externalUserId)));
  if (!link) return false;
  await db.delete(connections).where(eq(connections.userId, link.userId));
  return true;
}

export async function getDeletionStatus(db: Db, code: string) {
  const [r] = await db.select({ code: dataDeletionRequests.code, status: dataDeletionRequests.status, createdAt: dataDeletionRequests.createdAt }).from(dataDeletionRequests).where(eq(dataDeletionRequests.code, code));
  return r ?? null;
}
