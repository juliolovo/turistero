import { and, desc, eq } from "drizzle-orm";
import type { Db } from "./client";
import { decryptToken, encryptToken } from "./crypto";
import { connections } from "./schema";
import { newId } from "./sources";

export type ConnectionRow = typeof connections.$inferSelect;
/** Vista pública: jamás incluye el token. */
export type ConnectionInfo = Omit<ConnectionRow, "tokenEnc">;

const strip = ({ tokenEnc: _t, ...rest }: ConnectionRow): ConnectionInfo => rest;

export async function saveConnection(
  db: Db,
  c: { userId: string; provider: "facebook" | "instagram"; externalId: string; token: string; label?: string; scope?: string; expiresAt?: Date | null },
): Promise<ConnectionInfo> {
  const tokenEnc = encryptToken(c.token);
  const [row] = await db
    .insert(connections)
    .values({ id: newId(), userId: c.userId, provider: c.provider, externalId: c.externalId, label: c.label ?? null, scope: c.scope ?? null, expiresAt: c.expiresAt ?? null, tokenEnc })
    .onConflictDoUpdate({ target: [connections.userId, connections.provider, connections.externalId], set: { tokenEnc, label: c.label ?? null, scope: c.scope ?? null, expiresAt: c.expiresAt ?? null, lastError: null } })
    .returning();
  return strip(row!);
}

export async function listConnections(db: Db, userId?: string): Promise<ConnectionInfo[]> {
  const rows = await db.select().from(connections).where(userId ? eq(connections.userId, userId) : undefined).orderBy(desc(connections.createdAt));
  return rows.map(strip);
}

export async function deleteConnection(db: Db, userId: string, id: string): Promise<boolean> {
  return (await db.delete(connections).where(and(eq(connections.id, id), eq(connections.userId, userId))).returning({ id: connections.id })).length > 0;
}

/** Credenciales vigentes para un proveedor (la conexión más reciente y no vencida). Solo uso interno del runner. */
export async function getCredential(db: Db, provider: "facebook" | "instagram"): Promise<{ id: string; externalId: string; token: string } | null> {
  const rows = await db.select().from(connections).where(eq(connections.provider, provider)).orderBy(desc(connections.createdAt));
  const row = rows.find((r) => !r.expiresAt || r.expiresAt.getTime() > Date.now());
  if (!row) return null;
  return { id: row.id, externalId: row.externalId, token: decryptToken(row.tokenEnc) };
}

export async function markConnectionError(db: Db, id: string, message: string | null) {
  await db.update(connections).set({ lastError: message }).where(eq(connections.id, id));
}
