import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createDb, seedMockEvents, seedSources, type DbHandle } from "@turistero/db";
import { createSafeFetcher } from "@turistero/discovery";
import { createApp } from "./app";

const NOW = new Date("2026-09-24T18:00:00Z");
const ana = { "x-dev-user": "ana:USER" };
const beto = { "x-dev-user": "beto:USER" };
const staff = { "x-dev-user": "ed:EDITOR" };
const RANGE = "range=custom&from=2026-09-25&to=2026-10-10&pageSize=100";

type Route = { status?: number; body?: string };
const routes: Record<string, Route> = {};
const fetchImpl = (async (input: URL | string) => {
  const r = routes[input.toString()] ?? { status: 404, body: "" };
  return new Response(r.body ?? "", { status: r.status ?? 200 });
}) as unknown as typeof fetch;
const ld = (o: object) => `<html><head><script type="application/ld+json">${JSON.stringify(o)}</script></head></html>`;

let handle: DbHandle;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  handle = await createDb({ migrate: true });
  await seedSources(handle.db);
  await seedMockEvents(handle.db);
  app = createApp({
    db: handle.db, allowDevAuth: true, now: () => NOW,
    fetcher: createSafeFetcher({ fetchImpl, resolveHost: async () => ["93.184.216.34"], hostDelayMs: 0 }),
    logger: (await import("pino")).pino({ level: "silent" }),
  });
}, 60_000);
afterAll(() => handle.close());

const events = (who: Record<string, string>, extra = "") => request(app).get(`/api/events?${RANGE}${extra}`).set(who).expect(200);
const titles = (r: { body: { items: { title: string }[] } }) => r.body.items.map((e) => e.title);

describe("fuentes propias del usuario", () => {
  let anaSource = "";

  it("crear: exige sesión, validación y al menos un enlace", async () => {
    const body = { name: "Mi Operadora Favorita", city: "León", urls: { website: "https://mi-operadora.example/" } };
    await request(app).post("/api/my/sources").send(body).expect(401);
    await request(app).post("/api/my/sources").set(ana).send({ name: "Sin enlaces" }).expect(400);
    await request(app).post("/api/my/sources").set(ana).send({ ...body, urls: { website: "javascript:alert(1)" } }).expect(400);
    const ok = await request(app).post("/api/my/sources").set(ana).send(body).expect(201);
    anaSource = ok.body.id;
    expect(anaSource).toMatch(/^u-ana-mi-operadora-favorita$/);
    await request(app).post("/api/my/sources").set(ana).send(body).expect(409); // mismo nombre
    // otro usuario puede tener el mismo nombre: los ids se separan por usuario
    const other = await request(app).post("/api/my/sources").set(beto).send(body).expect(201);
    expect(other.body.id).toBe("u-beto-mi-operadora-favorita");
  });

  it("no aparecen en el catálogo global ni son accesibles por id", async () => {
    const list = await request(app).get("/api/sources?pageSize=100").expect(200);
    expect(list.body.items.some((s: { id: string }) => s.id.startsWith("u-"))).toBe(false);
    await request(app).get(`/api/sources/${anaSource}`).expect(404);
    await request(app).patch(`/api/sources/${anaSource}`).set(staff).send({ active: false }).expect(404); // ni un editor las toca
    await request(app).post(`/api/sources/${anaSource}/check`).set(staff).expect(404);
    const st = await request(app).get("/api/sources/status").set(staff).expect(200);
    expect(st.body.items.some((i: { source: { id: string } }) => i.source.id === anaSource)).toBe(false);
    const exp = await request(app).get("/api/sources/export").set(staff).expect(200);
    expect(JSON.stringify(exp.body)).not.toContain("u-ana");
  });

  it("solo el dueño la ve, edita, revisa o elimina", async () => {
    const mine = await request(app).get("/api/my/sources").set(ana).expect(200);
    expect(mine.body.private.map((s: { id: string }) => s.id)).toEqual([anaSource]);
    expect((await request(app).get("/api/my/sources").set(beto)).body.private.map((s: { id: string }) => s.id)).toEqual(["u-beto-mi-operadora-favorita"]);
    await request(app).patch(`/api/my/sources/${anaSource}`).set(beto).send({ notes: "hack" }).expect(404);
    await request(app).delete(`/api/my/sources/${anaSource}`).set(beto).expect(404);
    await request(app).post(`/api/my/sources/${anaSource}/check`).set(beto).expect(404);
    const patched = await request(app).patch(`/api/my/sources/${anaSource}`).set(ana).send({ notes: "mi nota" }).expect(200);
    expect(patched.body).toMatchObject({ notes: "mi nota", urls: { website: "https://mi-operadora.example/" } }); // el PATCH no borra lo demás
  });

  it("sus eventos son privados: solo el dueño los ve (también en su agenda)", async () => {
    routes["https://mi-operadora.example/"] = {
      body: ld({ "@type": "Event", name: "Tour Secreto de Ana", startDate: "2026-09-27T06:00:00-06:00", location: { name: "Salida desde León" }, offers: { price: 40, priceCurrency: "USD" } }),
    };
    const chk = await request(app).post(`/api/my/sources/${anaSource}/check`).set(ana).expect(201);
    expect(chk.body).toMatchObject({ status: "SUCCESS", eventsFound: 1, newEvents: 1 });

    expect(titles(await events(ana))).toContain("Tour Secreto de Ana");
    expect(titles(await events({}))).not.toContain("Tour Secreto de Ana"); // anónimo
    expect(titles(await events(beto))).not.toContain("Tour Secreto de Ana"); // otro usuario
    expect(titles(await events(staff))).not.toContain("Tour Secreto de Ana"); // ni siquiera el editor en el listado público

    const ev = (await events(ana)).body.items.find((e: { title: string }) => e.title === "Tour Secreto de Ana");
    await request(app).get(`/api/events/${ev.id}`).set(ana).expect(200);
    await request(app).get(`/api/events/${ev.id}`).set(beto).expect(404);
    await request(app).get(`/api/events/${ev.slug}`).expect(404);

    const agenda = await events(ana, "&mine=true");
    expect(titles(agenda)).toEqual(["Tour Secreto de Ana"]); // solo lo de su lista
    await request(app).get(`/api/events?${RANGE}&mine=true`).expect(401);
  });

  it("revisar demasiado seguido se limita (cortesía con los sitios)", async () => {
    await request(app).post(`/api/my/sources/${anaSource}/check`).set(ana).expect(429);
  });

  it("si una fuente pública ya publicó el mismo evento, la privada no se añade a la página pública", async () => {
    const pub = (await request(app).post("/api/events/from-source-content").set(staff).send({ text: "Tour Publico de Prueba, sábado 3 de octubre 6:00 AM en Salida desde León. US$30", organizer: "Operadora Publica", city: "León", publish: true }).expect(201)).body.items[0];
    routes["https://mi-operadora.example/"] = {
      body: ld({ "@type": "Event", name: "Tour Publico de Prueba", startDate: "2026-10-03T06:00:00-06:00", location: { name: "Salida desde León" } }),
    };
    // saltar el límite de 5 min: otra fuente privada del mismo usuario
    const s2 = await request(app).post("/api/my/sources").set(ana).send({ name: "Otra de Ana", city: "León", urls: { website: "https://mi-operadora.example/" } }).expect(201);
    await request(app).post(`/api/my/sources/${s2.body.id}/check`).set(ana).expect(201);
    const detail = await request(app).get(`/api/events/${pub.id}`).expect(200);
    expect(detail.body.sources.map((s: { sourceId: string }) => s.sourceId)).not.toContain(s2.body.id);
    expect(detail.body.sources.some((s: { sourceName: string }) => /Otra de Ana/.test(s.sourceName))).toBe(false);
  });

  it("eliminar la fuente propia", async () => {
    await request(app).delete(`/api/my/sources/${anaSource}`).set(ana).expect(204);
    expect(titles(await events(ana))).not.toContain("Tour Secreto de Ana"); // sus eventos privados se van con la fuente
    expect((await request(app).get("/api/my/sources").set(ana)).body.private.map((s: { id: string }) => s.id)).not.toContain(anaSource);
  });
});

describe("suscripciones al catálogo", () => {
  it("la agenda incluye solo lo de las fuentes suscritas", async () => {
    routes["https://operadora-global.example/"] = {
      body: ld({ "@type": "Event", name: "Tour Ometepe Global", startDate: "2026-09-28T06:00:00-06:00", location: { name: "Salida desde Managua" } }),
    };
    await request(app).post("/api/sources").set(staff).send({ id: "operadora-global", name: "Operadora Global", type: "tour-operator", city: "Managua", urls: { website: "https://operadora-global.example/" } }).expect(201);
    await request(app).post("/api/discovery-runs").set(staff).send({ sourceIds: ["operadora-global"] }).expect(201);

    expect(titles(await events({}))).toContain("Tour Ometepe Global"); // público
    expect(titles(await events(ana, "&mine=true"))).toEqual([]); // sin suscripciones, su agenda está vacía

    await request(app).put("/api/my/subscriptions/operadora-global").send({}).expect(401);
    await request(app).put("/api/my/subscriptions/no-existe").set(ana).send({}).expect(404);
    // Cuerpo vacío (lo que envía el botón "Añadir"), repetido: idempotente y no falla
    await request(app).put("/api/my/subscriptions/operadora-global").set(ana).send({}).expect(204);
    await request(app).put("/api/my/subscriptions/operadora-global").set(ana).send({}).expect(204);
    await request(app).put("/api/my/subscriptions/operadora-global").set(ana).send({ alias: "Mi favorita" }).expect(204);
    expect(titles(await events(ana, "&mine=true"))).toEqual(["Tour Ometepe Global"]);
    expect(titles(await events(beto, "&mine=true"))).toEqual([]); // la suscripción es personal

    const mine = await request(app).get("/api/my/sources").set(ana);
    expect(mine.body.subscribed[0]).toMatchObject({ enabled: true, alias: "Mi favorita", source: { id: "operadora-global" } });

    await request(app).put("/api/my/subscriptions/operadora-global").set(ana).send({ enabled: false }).expect(204);
    expect(titles(await events(ana, "&mine=true"))).toEqual([]);
    await request(app).delete("/api/my/subscriptions/operadora-global").set(ana).expect(204);
    await request(app).delete("/api/my/subscriptions/operadora-global").set(ana).expect(404);
  });

  it("no se puede suscribir a la fuente privada de otro usuario", async () => {
    await request(app).put("/api/my/subscriptions/u-beto-mi-operadora-favorita").set(ana).send({}).expect(404);
  });
});

describe("límites", () => {
  it("tope de fuentes propias por usuario", async () => {
    const who = { "x-dev-user": "carla:USER" };
    for (let i = 0; i < 50; i++) await request(app).post("/api/my/sources").set(who).send({ name: `Fuente ${i}`, urls: { website: `https://f${i}.example/` } }).expect(201);
    await request(app).post("/api/my/sources").set(who).send({ name: "Una más", urls: { website: "https://extra.example/" } }).expect(409);
  }, 60_000);

});
