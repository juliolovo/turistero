import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createDb, seedMockEvents, seedSources, type DbHandle } from "@turistero/db";
import { createApp } from "./app";

let handle: DbHandle;
let app: ReturnType<typeof createApp>;
const staff = { "x-dev-user": "editor1:EDITOR" };
const admin = { "x-dev-user": "admin1:ADMIN" };
const user = { "x-dev-user": "user1:USER" };

beforeAll(async () => {
  handle = await createDb({ migrate: true }); // PGlite en memoria
  await seedSources(handle.db);
  await seedMockEvents(handle.db);
  app = createApp({ db: handle.db, allowDevAuth: true, logger: (await import("pino")).pino({ level: "silent" }) });
}, 60_000);
afterAll(() => handle.close());

describe("events API", () => {
  it("lista eventos de los próximos 7 días, paginados", async () => {
    const res = await request(app).get("/api/events?pageSize=5").expect(200);
    expect(res.body.items).toHaveLength(5);
    expect(res.body.total).toBeGreaterThan(5);
    expect(res.body.items[0]).toMatchObject({ isMock: true });
    const dates = res.body.items.map((e: { startsAt: string }) => e.startsAt);
    expect([...dates].sort()).toEqual(dates);
  });

  it("filtra por categoría, ciudad y gratis", async () => {
    const tours = await request(app).get("/api/events?category=tours&pageSize=50").expect(200);
    expect(tours.body.items.length).toBeGreaterThan(0);
    expect(tours.body.items.every((e: { category: string }) => e.category === "tours")).toBe(true);

    const leon = await request(app).get("/api/events?city=leon&pageSize=50").expect(200);
    expect(leon.body.items.every((e: { placeId: string }) => e.placeId === "leon")).toBe(true);

    const free = await request(app).get("/api/events?price=free&pageSize=50").expect(200);
    expect(free.body.items.every((e: { price: { isFree: boolean } }) => e.price.isFree)).toBe(true);
  });

  it("busca por título, ciudad y categoría sin importar acentos", async () => {
    const byTitle = await request(app).get("/api/events?q=metallica&range=week").expect(200);
    expect(byTitle.body.items[0].title).toBe("Tributo a Metallica");
    const byCity = await request(app).get("/api/events?q=leon&pageSize=50").expect(200);
    expect(byCity.body.items.length).toBeGreaterThan(0);
    const accent = await request(app).get("/api/events?q=Rock&pageSize=50").expect(200);
    expect(accent.body.items.some((e: { category: string }) => e.category === "rock")).toBe(true);
  });

  it("valida la entrada con Zod", async () => {
    const res = await request(app).get("/api/events?category=nada&pageSize=1000").expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("nunca sustituye el enlace de la publicación por el del perfil", async () => {
    const res = await request(app).get("/api/events?q=metallica").expect(200);
    const src = res.body.items[0].sources[0];
    expect(src.originalPostUrl).toBeNull();
    expect(src.urlKind).toBe("PROFILE_URL");
  });

  it("oculta eventos LOW/HIDDEN al público y los muestra al editor", async () => {
    const list = await request(app).get("/api/events?q=metallica").expect(200);
    const id = list.body.items[0].id;
    await request(app).patch(`/api/events/${id}`).send({ status: "HIDDEN" }).expect(401);
    await request(app).patch(`/api/events/${id}`).set(user).send({ status: "HIDDEN" }).expect(403);
    await request(app).patch(`/api/events/${id}`).set(staff).send({ status: "HIDDEN" }).expect(200);
    await request(app).get(`/api/events/${id}`).expect(404);
    await request(app).get(`/api/events/${id}`).set(staff).expect(200);
    await request(app).patch(`/api/events/${id}`).set(staff).send({ status: "PUBLISHED" }).expect(200);
  });

  it("devuelve categorías con emoji fijo", async () => {
    const res = await request(app).get("/api/categories").expect(200);
    expect(res.body.items.find((c: { id: string }) => c.id === "rock").emoji).toBe("🎸");
  });
});

describe("sources API", () => {
  it("el catálogo semilla incluye las fuentes iniciales", async () => {
    const res = await request(app).get("/api/sources?pageSize=100").expect(200);
    const ids = res.body.items.map((s: { id: string }) => s.id);
    expect(ids).toContain("ron-kon-rolas");
    expect(ids).toContain("the-mamuth-pub");
  });

  it("solo EDITOR crea fuentes; valida y evita duplicados", async () => {
    const body = { id: "mi-operadora", name: "Mi Operadora", type: "tour-operator", city: "León", urls: { facebook: "https://www.facebook.com/mi.operadora" } };
    await request(app).post("/api/sources").send(body).expect(401);
    await request(app).post("/api/sources").set(user).send(body).expect(403);
    const ok = await request(app).post("/api/sources").set(staff).send(body).expect(201);
    expect(ok.body.active).toBe(true);
    await request(app).post("/api/sources").set(staff).send(body).expect(409);
    await request(app).post("/api/sources").set(staff).send({ ...body, id: "Mal Slug" }).expect(400);
    await request(app).post("/api/sources").set(staff).send({ ...body, id: "otra", urls: { facebook: "javascript:alert(1)" } }).expect(400);
  });

  it("edita, revisa (auditoría honesta) y elimina", async () => {
    await request(app).patch("/api/sources/mi-operadora").set(staff).send({ active: false, notes: "pausada" }).expect(200);
    const chk = await request(app).post("/api/sources/mi-operadora/check").set(staff).expect(201);
    expect(chk.body.status).toBe("AUTH_REQUIRED"); // FB sin credenciales: no se finge revisión
    const hist = await request(app).get("/api/sources/mi-operadora/checks").set(staff).expect(200);
    expect(hist.body.total).toBe(1);
    await request(app).delete("/api/sources/mi-operadora").set(staff).expect(403);
    await request(app).delete("/api/sources/mi-operadora").set(admin).expect(204);
    await request(app).get("/api/sources/mi-operadora").expect(404);
  });

  it("exporta e importa JSON del catálogo", async () => {
    const exp = await request(app).get("/api/sources/export").set(staff).expect(200);
    expect(exp.body.version).toBe(1);
    expect(JSON.stringify(exp.body)).not.toMatch(/secret|token|password/i);
    const file = { version: 1, sources: [{ id: "nueva-fuente", name: "Nueva Fuente", type: "venue", city: "Granada" }] };
    const imp = await request(app).post("/api/sources/import").set(admin).send({ file }).expect(200);
    expect(imp.body).toEqual({ created: 1, updated: 0, skipped: 0 });
    const again = await request(app).post("/api/sources/import").set(admin).send({ file }).expect(200);
    expect(again.body.skipped).toBe(1);
    await request(app).post("/api/sources/import").set(staff).send({ file }).expect(403);
  });

  it("candidatos: aprobar, rechazar y fusionar sin pisar URLs existentes", async () => {
    const c1 = await request(app).post("/api/source-candidates").set(staff).send({ name: "Tours Volcán Express", city: "Masaya", urls: { instagram: "https://www.instagram.com/tve" } }).expect(201);
    const ap = await request(app).post(`/api/source-candidates/${c1.body.id}`).set(staff).send({ action: "approve" }).expect(200);
    expect(ap.body.source.id).toBe("tours-volcan-express");
    await request(app).post(`/api/source-candidates/${c1.body.id}`).set(staff).send({ action: "reject" }).expect(409);

    const c2 = await request(app).post("/api/source-candidates").set(staff).send({ name: "RKR bar", urls: { facebook: "https://www.facebook.com/otro", instagram: "https://www.instagram.com/rkr_alt" } }).expect(201);
    await request(app).post(`/api/source-candidates/${c2.body.id}`).set(staff).send({ action: "merge", intoSourceId: "ron-kon-rolas" }).expect(200);
    const rkr = await request(app).get("/api/sources/ron-kon-rolas").expect(200);
    expect(rkr.body.urls.facebook).toBe("https://www.facebook.com/ronkonrolas.bar.en.managua"); // no se pisa
    expect(rkr.body.urls.instagram).toBe("https://www.instagram.com/ronkonrolas");
  });
});

describe("discovery runs y auditoría", () => {
  it("una corrida registra TODAS las fuentes activas", async () => {
    const active = await request(app).get("/api/sources?active=true&pageSize=100").expect(200);
    const run = await request(app).post("/api/discovery-runs").set(staff).send({}).expect(201);
    expect(run.body.sourcesChecked).toBe(active.body.total);
    expect(run.body.completedAt).toBeTruthy();
    const status = await request(app).get("/api/sources/status").set(staff).expect(200);
    const activeIds = new Set(active.body.items.map((s: { id: string }) => s.id));
    const unchecked = status.body.items.filter((i: { source: { id: string }; lastCheck: unknown }) => activeIds.has(i.source.id) && !i.lastCheck);
    expect(unchecked).toEqual([]);
    const runs = await request(app).get("/api/discovery-runs").set(staff).expect(200);
    expect(runs.body.total).toBeGreaterThanOrEqual(1);
  });
});

describe("favoritos", () => {
  it("requiere sesión, agrega, lista y elimina", async () => {
    const ev = (await request(app).get("/api/events?q=metallica")).body.items[0];
    await request(app).get("/api/favorites").expect(401);
    await request(app).post(`/api/favorites/${ev.id}`).set(user).expect(204);
    await request(app).post(`/api/favorites/${ev.id}`).set(user).expect(204); // idempotente
    const list = await request(app).get("/api/favorites").set(user).expect(200);
    expect(list.body.total).toBe(1);
    await request(app).post("/api/favorites/no-existe").set(user).expect(404);
    await request(app).delete(`/api/favorites/${ev.id}`).set(user).expect(204);
    expect((await request(app).get("/api/favorites").set(user)).body.total).toBe(0);
  });
});

describe("errores", () => {
  it("404 y JSON inválido tienen formato estable", async () => {
    const nf = await request(app).get("/api/nada").expect(404);
    expect(nf.body.error.code).toBe("NOT_FOUND");
    const bad = await request(app).post("/api/sources").set(staff).set("content-type", "application/json").send("{oops").expect(400);
    expect(bad.body.error.code).toBe("BAD_JSON");
  });
});
