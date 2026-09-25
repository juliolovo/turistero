import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { users } from "./schema";
import type { UserRow } from "./users";
import { newId } from "./sources";

/**
 * Contraseñas con scrypt (node:crypto, sin dependencias nativas). Formato: scrypt$N$r$p$salt$hash (base64url).
 * Parámetros: N=2^15, r=8, p=1 (≈32 MB por cálculo): costoso para un atacante, razonable para un login.
 */
const N = 32768, R = 8, P = 1, KEYLEN = 64;
const scryptAsync = (pw: string, salt: Buffer, keylen: number, opts: ScryptOptions) =>
  new Promise<Buffer>((res, rej) => scrypt(pw, salt, keylen, opts, (e, k) => (e ? rej(e) : res(k))));
const OPTS = (n: number, r: number, p: number): ScryptOptions => ({ N: n, r, p, maxmem: 256 * n * r });

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(pw.normalize("NFKC"), salt, KEYLEN, OPTS(N, R, P));
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const key = await scryptAsync(pw.normalize("NFKC"), Buffer.from(salt, "base64url"), expected.length, OPTS(+n, +r, +p));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

const COMMON = new Set(["password", "contrasena", "contraseña", "123456789", "1234567890", "qwertyuiop", "abc123456", "iloveyou", "administrador", "12345678910", "password123", "contrasena123"]);

/** Devuelve la lista de problemas (vacía si es válida). */
export function passwordProblems(pw: string, email?: string): string[] {
  const out: string[] = [];
  if (pw.length < 10) out.push("Debe tener al menos 10 caracteres.");
  if (pw.length > 128) out.push("Debe tener como máximo 128 caracteres.");
  if (COMMON.has(pw.toLowerCase())) out.push("Es una contraseña demasiado común.");
  const local = email?.split("@")[0]?.toLowerCase() ?? "";
  if (local.length >= 4 && pw.toLowerCase().includes(local)) out.push("No debe contener tu correo.");
  if ((!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) && pw.length < 14) out.push("Usa letras y números, o una frase de 14+ caracteres.");
  return out;
}

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;


export async function registerPasswordUser(db: Db, i: { email: string; password: string; name?: string | null }): Promise<UserRow | "exists" | { problems: string[] }> {
  const email = i.email.trim().toLowerCase();
  const problems = passwordProblems(i.password, email);
  if (problems.length) return { problems };
  if ((await db.select({ id: users.id }).from(users).where(eq(users.email, email))).length) return "exists";
  const passwordHash = await hashPassword(i.password);
  // El correo NO se considera verificado (no hay envío de correo): nunca se vincula ni concede ADMIN por este medio.
  const [row] = await db.insert(users).values({ id: newId(), email, name: i.name ?? null, passwordHash, role: "USER" }).returning();
  return row!;
}

const DUMMY = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$" + Buffer.alloc(64).toString("base64url");

/** Verifica credenciales con bloqueo temporal tras varios fallos. Trabajo constante aunque el usuario no exista. */
export async function verifyLogin(db: Db, emailRaw: string, password: string, now = new Date()): Promise<UserRow | "invalid" | { locked: Date }> {
  const email = emailRaw.trim().toLowerCase();
  const [u] = await db.select().from(users).where(eq(users.email, email));
  if (!u || !u.passwordHash) {
    await verifyPassword(password, DUMMY); // evita distinguir "no existe" por tiempo de respuesta
    return "invalid";
  }
  if (u.lockedUntil && u.lockedUntil > now) return { locked: u.lockedUntil };
  if (await verifyPassword(password, u.passwordHash)) {
    if (u.failedLogins || u.lockedUntil) await db.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, u.id));
    return u;
  }
  const failed = u.failedLogins + 1;
  const lock = failed >= MAX_FAILED_LOGINS ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null;
  await db.update(users).set({ failedLogins: lock ? 0 : failed, lockedUntil: lock }).where(eq(users.id, u.id));
  return lock ? { locked: lock } : "invalid";
}
