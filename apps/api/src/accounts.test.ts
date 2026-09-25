import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { accounts, connections, createDb, passwordProblems, saveConnection, users, verifyPassword, hashPassword, type DbHandle } from "@turistero/db";
import { createApp } from "./app";
import { parseSignedRequest } from "./meta-callbacks";

const SERVICE = "svc-token-abcdefghijklmnopqrstuvwxyz";
const APP_SECRET = "meta-app-secret-de-prueba";
let handle: DbHandle;
let app: ReturnType<typeof createApp>;

const svc = (path: string, body: object) => request(app).post(path).set("authorization", `Bearer ${SERVICE}`).send(body);
const register = (email: string, password: string, name?: string) => svc("/api/internal/auth/register", { email, password, name });
const verify = (email: string, password: string) => svc("/api/internal/auth/verify", { email, password });
const sync = (body: object) => svc("/api/internal/users/sync", body);

beforeAll(async () => {
  process.env.META_APP_SECRET = APP_SECRET;
  process.env.TOKEN_ENCRYPTION_KEY = "clave-de-prueba-suficientemente-larga";
  process.env.NEXT_PUBLIC_SITE_URL = "https://turistero.example";
  handle = await createDb({ migrate: true });
  app = createApp({ db: handle.db, serviceToken: SERVICE, logger: (await import("pino")).pino({ level: "silent" }) });
}, 60_000);
afterAll(() => handle.close());

describe("contraseñas", () => {
  it("hash con scrypt: salado, verificable y sin filtrar la contraseña", async () => {
    const a = await hashPassword("una-frase-larga-123");
    const b = await hashPassword("una-frase-larga-123");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(a).not.toContain("una-frase");
    expect(await verifyPassword("una-frase-larga-123", a)).toBe(true);
    expect(await verifyPassword("otra", a)).toBe(false);
    expect(await verifyPassword("x", "basura")).toBe(false);
  });

  it("política de contraseñas", () => {
    expect(passwordProblems("corta1")).not.toEqual([]);
    expect(passwordProblems("solo-letras-abc")).toEqual([]); // 15+ caracteres: se acepta como frase
    expect(passwordProblems("sololetrasx")).not.toEqual([]); // 11 caracteres sin números
    expect(passwordProblems("contrasena123")).not.toEqual([]); // demasiado común
    expect(passwordProblems("juanperez-2026-x", "juanperez@example.com")).not.toEqual([]); // contiene el correo
    expect(passwordProblems("Buena-clave-2026")).toEqual([]);
    expect(passwordProblems("una frase muy larga y facil de recordar")).toEqual([]);
  });
});

describe("registro y acceso con usuario y contraseña", () => {
  it("solo la web (token de servicio) puede registrar o verificar", async () => {
    await request(app).post("/api/internal/auth/register").send({ email: "x@example.com", password: "Buena-clave-2026" }).expect(403);
    await request(app).post("/api/internal/auth/verify").send({ email: "x@example.com", password: "Buena-clave-2026" }).expect(403);
  });

  it("registra, rechaza débiles y duplicados; el correo se normaliza; nunca devuelve el hash", async () => {
    await register("nueva@example.com", "corta").then((r) => expect(r.status).toBe(422));
    const ok = await register("Nueva@Example.com", "Buena-clave-2026", "Nueva").expect(201);
    expect(ok.body).toMatchObject({ role: "USER", email: "nueva@example.com" });
    expect(JSON.stringify(ok.body)).not.toMatch(/scrypt|password/i);
    await register("nueva@example.com", "Otra-clave-2026").then((r) => expect(r.status).toBe(409));
    await svc("/api/internal/auth/register", { email: "no-es-correo", password: "Buena-clave-2026" }).then((r) => expect(r.status).toBe(400));
  });

  it("verifica credenciales; mismo error para usuario inexistente y contraseña errónea", async () => {
    const ok = await verify("nueva@example.com", "Buena-clave-2026").then((r) => r);
    expect(ok.status).toBe(200);
    const wrong = await verify("nueva@example.com", "mala-clave-000");
    const ghost = await verify("nadie@example.com", "mala-clave-000");
    expect(wrong.status).toBe(401);
    expect(ghost.status).toBe(401);
    expect(wrong.body.error.message).toBe(ghost.body.error.message);
  });

  it("bloquea tras 5 fallos y se libera al vencer el bloqueo", async () => {
    await register("bloqueo@example.com", "Buena-clave-2026").then((r) => expect(r.status).toBe(201));
    for (let i = 0; i < 4; i++) expect((await verify("bloqueo@example.com", `mala-${i}-clave`)).status).toBe(401);
    expect((await verify("bloqueo@example.com", "mala-5-clave")).status).toBe(429);
    // durante el bloqueo, ni la contraseña correcta entra
    expect((await verify("bloqueo@example.com", "Buena-clave-2026")).status).toBe(429);
    await handle.db.update(users).set({ lockedUntil: new Date(Date.now() - 1000) }).where(eq(users.email, "bloqueo@example.com"));
    expect((await verify("bloqueo@example.com", "Buena-clave-2026")).status).toBe(200);
  }, 60_000);

  it("una cuenta social (sin contraseña) no entra por contraseña", async () => {
    await sync({ provider: "google", providerAccountId: "g-sin-pw", email: "social@example.com", emailVerified: true });
    expect((await verify("social@example.com", "cualquier-cosa-123")).status).toBe(401);
  });

  it("anti pre-secuestro: si el dueño real reclama el correo con un proveedor verificado, la contraseña anterior deja de servir", async () => {
    await register("victima@example.com", "Clave-del-atacante-1").then((r) => expect(r.status).toBe(201));
    expect((await verify("victima@example.com", "Clave-del-atacante-1")).status).toBe(200);
    await sync({ provider: "google", providerAccountId: "g-victima", email: "victima@example.com", emailVerified: true });
    expect((await verify("victima@example.com", "Clave-del-atacante-1")).status).toBe(401);
  }, 60_000);

  it("los proveedores nuevos se aceptan; Microsoft no verifica el correo (no vincula ni da ADMIN)", async () => {
    const g = await sync({ provider: "google", providerAccountId: "g-ms", email: "ms@example.com", emailVerified: true });
    const ms = await sync({ provider: "microsoft-entra-id", providerAccountId: "ms-1", email: "ms@example.com", emailVerified: false });
    expect(ms.status).toBe(200);
    expect(ms.body.id).not.toBe(g.body.id);
    const apple = await sync({ provider: "apple", providerAccountId: "ap-1", email: "ms@example.com", emailVerified: true });
    expect(apple.body.id).toBe(g.body.id);
    await sync({ provider: "dev", providerAccountId: "x" }).then((r) => expect(r.status).toBe(403)); // login de desarrollo apagado
  });
});

/* ---------- callbacks de Meta ---------- */
const signed = (payload: object, secret = APP_SECRET) => {
  const p = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", issued_at: 1, ...payload })).toString("base64url");
  return `${createHmac("sha256", secret).update(p).digest("base64url")}.${p}`;
};
const form = (path: string, signed_request: string) => request(app).post(path).type("form").send({ signed_request });

describe("callbacks de Meta", () => {
  it("parseSignedRequest rechaza firmas inválidas o algoritmos distintos", () => {
    expect(parseSignedRequest(signed({ user_id: "1" }), APP_SECRET)?.user_id).toBe("1");
    expect(parseSignedRequest(signed({ user_id: "1" }, "otro-secreto"), APP_SECRET)).toBeNull();
    expect(parseSignedRequest("basura", APP_SECRET)).toBeNull();
    expect(parseSignedRequest(signed({ user_id: "1" }), undefined)).toBeNull();
    expect(parseSignedRequest(signed({ user_id: "1", algorithm: "HMAC-SHA1" }), APP_SECRET)).toBeNull();
  });

  it("eliminación de datos: borra al usuario que solo existía por Facebook y devuelve url + código", async () => {
    const u = (await sync({ provider: "facebook", providerAccountId: "fb-100", email: "fb@example.com", emailVerified: false })).body.id;
    const res = await form("/api/meta/data-deletion", signed({ user_id: "fb-100" })).expect(200);
    expect(res.body.confirmation_code).toMatch(/^[a-f0-9]{16}$/);
    expect(res.body.url).toBe(`https://turistero.example/data-deletion?code=${res.body.confirmation_code}`);
    expect(await handle.db.select().from(users).where(eq(users.id, u))).toHaveLength(0);
    const st = await request(app).get(`/api/meta/data-deletion/${res.body.confirmation_code}`).expect(200);
    expect(st.body.status).toBe("COMPLETED");
  });

  it("si tiene otros accesos, solo se desvincula Facebook y se borran sus conexiones a Meta", async () => {
    const g = (await sync({ provider: "google", providerAccountId: "g-fbboth", email: "both@example.com", emailVerified: true })).body.id;
    await sync({ provider: "facebook", providerAccountId: "fb-200", email: "both@example.com", emailVerified: true });
    await saveConnection(handle.db, { userId: g, provider: "facebook", externalId: "app", token: "token-largo-de-prueba" });
    await form("/api/meta/data-deletion", signed({ user_id: "fb-200" })).expect(200);
    expect(await handle.db.select().from(users).where(eq(users.id, g))).toHaveLength(1);
    expect((await handle.db.select().from(accounts).where(eq(accounts.userId, g))).map((a) => a.provider)).toEqual(["google"]);
    expect(await handle.db.select().from(connections).where(eq(connections.userId, g))).toHaveLength(0);
  });

  it("usuario desconocido: se registra la solicitud como NOT_FOUND (Meta espera una respuesta igualmente)", async () => {
    const res = await form("/api/meta/data-deletion", signed({ user_id: "no-existe" })).expect(200);
    expect((await request(app).get(`/api/meta/data-deletion/${res.body.confirmation_code}`)).body.status).toBe("NOT_FOUND");
  });

  it("rechaza firmas falsas y códigos inexistentes", async () => {
    await form("/api/meta/data-deletion", signed({ user_id: "fb-100" }, "secreto-falso")).expect(400);
    await request(app).post("/api/meta/data-deletion").send({}).expect(400);
    await request(app).get("/api/meta/data-deletion/inexistente").expect(404);
  });

  it("desautorización: elimina conexiones pero conserva la cuenta", async () => {
    const u = (await sync({ provider: "facebook", providerAccountId: "fb-300", email: "deauth@example.com", emailVerified: false })).body.id;
    await saveConnection(handle.db, { userId: u, provider: "instagram", externalId: "ig1", token: "token-largo-de-prueba" });
    await form("/api/meta/deauthorize", signed({ user_id: "fb-300" })).expect(200);
    expect(await handle.db.select().from(users).where(eq(users.id, u))).toHaveLength(1);
    expect(await handle.db.select().from(connections).where(eq(connections.userId, u))).toHaveLength(0);
    await form("/api/meta/deauthorize", signed({ user_id: "fb-300" }, "x")).expect(400);
  });
});
