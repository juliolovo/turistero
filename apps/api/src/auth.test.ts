import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { SignJWT } from "jose";
import { seedMockEvents, type DbHandle } from "@turistero/db";
import { createTestDb } from "@turistero/db/src/testing";
import { createApp } from "./app";

const SECRET = "test-secret-test-secret-test-secret-0123";
const SERVICE = "svc-token-abcdefghijklmnopqrstuvwxyz";
let handle: DbHandle;
let app: ReturnType<typeof createApp>;

const sign = (sub: string, o: { secret?: string; exp?: string; iss?: string; aud?: string } = {}) =>
  new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuer(o.iss ?? "turistero-web")
    .setAudience(o.aud ?? "turistero-api")
    .setExpirationTime(o.exp ?? "5m")
    .sign(new TextEncoder().encode(o.secret ?? SECRET));

const sync = (body: object) => request(app).post("/api/internal/users/sync").set("authorization", `Bearer ${SERVICE}`).send(body);
const bearer = async (sub: string) => ({ authorization: `Bearer ${await sign(sub)}` });

beforeAll(async () => {
  handle = await createTestDb();
  await seedMockEvents(handle.db);
  app = createApp({
    db: handle.db,
    serviceToken: SERVICE,
    jwtSecret: SECRET,
    adminEmails: ["boss@example.com"],
    allowDevAuth: true,
    logger: (await import("pino")).pino({ level: "silent" }),
  });
}, 60_000);
afterAll(() => handle.close());

describe("sync de usuarios OAuth", () => {
  it("solo el servicio puede sincronizar", async () => {
    const body = { provider: "google", providerAccountId: "g1", email: "a@example.com", emailVerified: true };
    await request(app).post("/api/internal/users/sync").send(body).expect(403);
    await request(app).post("/api/internal/users/sync").set("x-dev-user", "service:ADMIN").send(body).expect(403); // id "service" reservado
    const ok = await sync(body).expect(200);
    expect(ok.body.role).toBe("USER");
  });

  it("el mismo login devuelve el mismo usuario", async () => {
    const a = await sync({ provider: "google", providerAccountId: "g2", email: "b@example.com", emailVerified: true, name: "B" });
    const b = await sync({ provider: "google", providerAccountId: "g2", email: "b@example.com", emailVerified: true });
    expect(b.body.id).toBe(a.body.id);
  });

  it("vincula por correo solo si el proveedor lo verificó", async () => {
    const g = await sync({ provider: "google", providerAccountId: "g3", email: "c@example.com", emailVerified: true });
    const fbUnverified = await sync({ provider: "facebook", providerAccountId: "f3", email: "c@example.com", emailVerified: false });
    expect(fbUnverified.body.id).not.toBe(g.body.id); // no se secuestra la cuenta
    expect(fbUnverified.body.email).toBeNull();
    const fbVerified = await sync({ provider: "facebook", providerAccountId: "f3b", email: "c@example.com", emailVerified: true });
    expect(fbVerified.body.id).toBe(g.body.id);
  });

  it("ADMIN_EMAILS otorga ADMIN solo con correo verificado", async () => {
    const fake = await sync({ provider: "facebook", providerAccountId: "f-boss", email: "boss@example.com", emailVerified: false });
    expect(fake.body.role).toBe("USER");
    const real = await sync({ provider: "google", providerAccountId: "g-boss", email: "boss@example.com", emailVerified: true });
    expect(real.body.role).toBe("ADMIN");
  });

  it("valida el cuerpo", async () => {
    await sync({ provider: "myspace", providerAccountId: "x" }).expect(400);
  });
});

describe("sesión con JWT", () => {
  let userId = "";
  beforeAll(async () => {
    userId = (await sync({ provider: "google", providerAccountId: "g-jwt", email: "jwt@example.com", emailVerified: true })).body.id;
  });

  it("acepta un JWT válido y devuelve /me", async () => {
    const res = await request(app).get("/api/me").set(await bearer(userId)).expect(200);
    expect(res.body).toMatchObject({ id: userId, role: "USER", email: "jwt@example.com" });
  });

  it("rechaza tokens con otra clave, vencidos, o con emisor/audiencia incorrectos", async () => {
    for (const t of [
      await sign(userId, { secret: "otra-clave-otra-clave-otra-clave-otra-clave" }),
      await sign(userId, { exp: "-1m" }),
      await sign(userId, { iss: "otro" }),
      await sign(userId, { aud: "otro" }),
      "no-es-un-jwt",
    ]) {
      await request(app).get("/api/me").set("authorization", `Bearer ${t}`).expect(401);
    }
  });

  it("un usuario inexistente no autentica aunque el token sea válido", async () => {
    await request(app).get("/api/me").set(await bearer("no-existe")).expect(401);
  });

  it("favoritos con sesión real", async () => {
    const auth = await bearer(userId);
    const ev = (await request(app).get("/api/events?pageSize=1")).body.items[0];
    await request(app).post(`/api/favorites/${ev.id}`).set(auth).expect(204);
    expect((await request(app).get("/api/favorites").set(auth)).body.total).toBe(1);
  });
});

describe("roles y administración", () => {
  const adminId = async () => (await sync({ provider: "google", providerAccountId: "g-boss", email: "boss@example.com", emailVerified: true })).body.id as string;

  it("solo ADMIN lista usuarios y cambia roles; el rol se lee de la BD", async () => {
    const admin = await adminId();
    const target = (await sync({ provider: "google", providerAccountId: "g-t", email: "t@example.com", emailVerified: true })).body.id;
    const tUser = await bearer(target);
    const tAdmin = await bearer(admin);

    await request(app).get("/api/users").set(tUser).expect(403);
    await request(app).patch(`/api/users/${target}`).set(tUser).send({ role: "ADMIN" }).expect(403); // sin escalada de privilegios

    const list = await request(app).get("/api/users").set(tAdmin).expect(200);
    expect(list.body.items[0]).not.toHaveProperty("image");
    await request(app).patch(`/api/users/${target}`).set(tAdmin).send({ role: "EDITOR" }).expect(200);
    // mismo token, ahora con permisos de EDITOR
    await request(app).post("/api/sources").set(tUser).send({ id: "de-editor", name: "De Editor", type: "venue" }).expect(201);
    await request(app).patch(`/api/users/${target}`).set(tAdmin).send({ role: "GOD" }).expect(400);
  });

  it("no permite dejar el sistema sin ADMIN", async () => {
    const res = await request(app).patch(`/api/users/${await adminId()}`).set(await bearer(await adminId())).send({ role: "USER" }).expect(409);
    expect(res.body.error.code).toBe("LAST_ADMIN");
  });
});

describe("filtros guardados", () => {
  it("cada usuario ve y borra solo los suyos", async () => {
    const a = (await sync({ provider: "google", providerAccountId: "g-fa", email: "fa@example.com", emailVerified: true })).body.id;
    const b = (await sync({ provider: "google", providerAccountId: "g-fb", email: "fb@example.com", emailVerified: true })).body.id;
    const ha = await bearer(a);
    const hb = await bearer(b);
    const f = await request(app).post("/api/saved-filters").set(ha).send({ name: "Tours en León", query: { city: "leon", category: "tours" } }).expect(201);
    expect((await request(app).get("/api/saved-filters").set(hb)).body.items).toHaveLength(0);
    await request(app).delete(`/api/saved-filters/${f.body.id}`).set(hb).expect(404);
    await request(app).delete(`/api/saved-filters/${f.body.id}`).set(ha).expect(204);
    await request(app).post("/api/saved-filters").set(ha).send({ name: "", query: {} }).expect(400);
  });
});
