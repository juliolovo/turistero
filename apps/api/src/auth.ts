import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";
import { getUser, users, type Db } from "@turistero/db";
import type { z } from "zod";
import type { roleSchema } from "@turistero/schemas";
import { HttpError } from "./http";

export type Role = z.infer<typeof roleSchema>;
export interface AuthUser {
  id: string;
  role: Role;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

const RANK: Record<Role, number> = { USER: 1, EDITOR: 2, ADMIN: 3 };

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Identifica al llamante. Tres mecanismos:
 *  1. `Authorization: Bearer <API_SERVICE_TOKEN>` — llamadas servidor a servidor / cron; actúa como ADMIN.
 *  2. `Authorization: Bearer <JWT>` — sesión del usuario, firmada (HS256) por la web con API_JWT_SECRET, vida corta.
 *     El rol se lee SIEMPRE de la BD (no del token) para que un cambio de rol o una baja surtan efecto de inmediato.
 *  3. `x-dev-user: <id>:<ROLE>` — SOLO si ALLOW_DEV_AUTH=1 (desarrollo/tests). Nunca en producción.
 */
export function authenticate(db: Db, env: { serviceToken?: string; jwtSecret?: string; allowDev: boolean }): RequestHandler {
  return async (req, _res, next) => {
    const bearer = req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (env.serviceToken && bearer && safeEqual(bearer, env.serviceToken)) {
      req.user = { id: "service", role: "ADMIN" };
      return next();
    }
    if (env.jwtSecret && bearer) {
      try {
        const { payload } = await jwtVerify(bearer, new TextEncoder().encode(env.jwtSecret), { issuer: "turistero-web", audience: "turistero-api", algorithms: ["HS256"] });
        const u = payload.sub ? await getUser(db, payload.sub) : null;
        if (u) req.user = { id: u.id, role: u.role };
      } catch {
        // token inválido o vencido: se trata como anónimo
      }
      if (req.user) return next();
    }
    const dev = req.header("x-dev-user");
    if (env.allowDev && dev) {
      const [id, role = "USER"] = dev.split(":");
      if (id && id !== "service" && role in RANK) {
        await db.insert(users).values({ id, role: role as Role, email: `${id}@dev.local` }).onConflictDoNothing();
        const [u] = await db.select().from(users).where(eq(users.id, id));
        req.user = { id, role: (u?.role ?? role) as Role };
      }
    }
    next();
  };
}

export const requireService: RequestHandler = (req, _res, next) => {
  if (req.user?.id !== "service") return next(new HttpError(403, "FORBIDDEN", "Solo llamadas servidor a servidor"));
  next();
};

export const requireRole =
  (min: Role): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(new HttpError(401, "UNAUTHENTICATED", "Inicia sesión"));
    if (RANK[req.user.role] < RANK[min]) return next(new HttpError(403, "FORBIDDEN", "Permisos insuficientes"));
    next();
  };
