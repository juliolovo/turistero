import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { connections, createDb, seedSources, type DbHandle } from "@turistero/db";
import { createSafeFetcher } from "@turistero/discovery";
import { createApp } from "./app";

const NOW = new Date("2026-09-24T18:00:00Z"); // jueves 24/09/2026 12:00 Managua
const staff = { "x-dev-user": "ed:EDITOR" };
const admin = { "x-dev-user": "ad:ADMIN" };
const RANGE = "range=custom&from=2026-09-25&to=2026-10-05&pageSize=100";

type Route = { status?: number; body?: string; headers?: Record<string, string> };
let routes: Record<string, Route> = {};
const calls: string[] = [];
const fetchImpl = (async (input: URL | string) => {
  const url = input.toString();
  calls.push(url);
  const r = routes[url] ?? { status: 404, body: "" };
  return new Response(r.body ?? "", { status: r.status ?? 200, headers: r.headers ?? {} });
}) as unknown as typeof fetch;

const ld = (o: object) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
const html = (head: string, body = "") => `<html><head><title>Sitio</title>${head}</head><body>${body}</body></html>`;

let tickCount = 0;
let handle: DbHandle;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  process.env.TOKEN_ENCRYPTION_KEY = "clave-de-prueba-suficientemente-larga";
  handle = await createDb({ migrate: true });
  await seedSources(handle.db);
  app = createApp({
    db: handle.db, allowDevAuth: true, now: () => new Date(NOW.getTime() + tickCount++ * 1000), // reloj que avanza: evita empates entre revisiones
    fetcher: createSafeFetcher({ fetchImpl, resolveHost: async () => ["93.184.216.34"], hostDelayMs: 0 }),
    logger: (await import("pino")).pino({ level: "silent" }),
  });
}, 60_000);
afterAll(() => handle.close());

const addSource = (id: string, urls: object, extra: object = {}) =>
  request(app).post("/api/sources").set(staff).send({ id, name: id, type: "tour-operator", city: "León", urls, ...extra }).expect(201);
const runOnly = (...ids: string[]) => request(app).post("/api/discovery-runs").set(staff).send({ sourceIds: ids }).expect(201);
const list = (extra = "") => request(app).get(`/api/events?${RANGE}${extra}`).set(staff).expect(200);

describe("descubrimiento de punta a punta", () => {
  it("un sitio con JSON-LD crea un evento publicado y registra la auditoría", async () => {
    routes = {
      "https://operadora-uno.example/": { body: html(
        ld({ "@type": "Event", name: "Tour Cerro Negro", startDate: "2026-09-26T05:00:00-06:00", location: { name: "Salida desde León" }, offers: { price: 35, priceCurrency: "USD" }, url: "https://operadora-uno.example/e/cerro-negro" }),
        '<a href="https://www.instagram.com/nuevaoperadora/">IG</a>') },
    };
    await addSource("operadora-uno", { website: "https://operadora-uno.example/" });
    const run = await runOnly("operadora-uno");
    expect(run.body).toMatchObject({ sourcesChecked: 1, eventsFound: 1, newEvents: 1, errors: 0, status: "COMPLETED" });

    const evs = (await list()).body.items.filter((e: { title: string }) => e.title === "Tour Cerro Negro");
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ category: "tours", confidence: "HIGH", status: "PUBLISHED", isMock: false, placeId: "leon" });
    expect(evs[0].price).toMatchObject({ currency: "USD", min: 35 });
    expect(evs[0].sources[0]).toMatchObject({ urlKind: "EVENT_SOURCE_URL", originalPostUrl: "https://operadora-uno.example/e/cerro-negro" });

    const st = await request(app).get("/api/sources/status").set(staff);
    const row = st.body.items.find((i: { source: { id: string } }) => i.source.id === "operadora-uno");
    expect(row.lastCheck).toMatchObject({ status: "SUCCESS", eventsFound: 1 });
  });

  it("el perfil de Instagram encontrado se propone como candidato (una sola vez)", async () => {
    const cands = await request(app).get("/api/source-candidates?status=PENDING").set(staff).expect(200);
    const hit = cands.body.items.filter((c: { urls: { instagram: string | null } }) => c.urls.instagram === "https://www.instagram.com/nuevaoperadora");
    expect(hit).toHaveLength(1);
    await runOnly("operadora-uno"); // segunda corrida
    const again = await request(app).get("/api/source-candidates?status=PENDING&pageSize=100").set(staff);
    expect(again.body.items.filter((c: { urls: { instagram: string | null } }) => c.urls.instagram === "https://www.instagram.com/nuevaoperadora")).toHaveLength(1);
  });

  it("re-ejecutar no duplica; otra fuente con el mismo evento se suma como fuente alternativa", async () => {
    routes["https://operadora-dos.example/"] = { body: html(ld({ "@type": "Event", name: "TOUR CERRO NEGRO 🌋", startDate: "2026-09-26T05:00:00-06:00", location: { name: "Salida desde León" }, url: "https://operadora-dos.example/tour" })) };
    await addSource("operadora-dos", { website: "https://operadora-dos.example/" });
    const r2 = await runOnly("operadora-uno", "operadora-dos");
    expect(r2.body.newEvents).toBe(0);
    const evs = (await list()).body.items.filter((e: { title: string }) => /cerro negro/i.test(e.title));
    expect(evs).toHaveLength(1);
    expect(evs[0].sources.map((s: { sourceId: string }) => s.sourceId).sort()).toEqual(["operadora-dos", "operadora-uno"]);
  });

  it("confianza LOW queda en revisión: oculta al público, visible al editor", async () => {
    routes["https://bar.example/"] = { body: html("", "<p>Este sábado noche de salsa, vení!</p>") };
    await addSource("bar-vago", { website: "https://bar.example/" }, { type: "organizer", city: "Managua" });
    await runOnly("bar-vago");
    const all = await request(app).get(`/api/events?range=week&status=PENDING&pageSize=100`).set(staff).expect(200);
    const low = all.body.items.find((e: { sources: { sourceId: string }[] }) => e.sources[0]?.sourceId === "bar-vago");
    expect(low).toMatchObject({ confidence: "LOW", status: "PENDING" });
    const pub = await request(app).get(`/api/events?range=week&pageSize=100`).expect(200);
    expect(pub.body.items.some((e: { id: string }) => e.id === low.id)).toBe(false);
  });

  it("sin fecha verificable => NO_EVENTS; no se inventa nada", async () => {
    routes["https://aburrida.example/"] = { body: html("", "<p>Bienvenidos a nuestra operadora de turismo.</p>") };
    await addSource("aburrida", { website: "https://aburrida.example/" });
    const before = (await list()).body.total;
    await runOnly("aburrida");
    expect((await list()).body.total).toBe(before);
    const st = await request(app).get("/api/sources/aburrida/checks").set(staff);
    expect(st.body.items[0]).toMatchObject({ status: "NO_EVENTS", eventsFound: 0 });
  });

  it("un sitio bloqueado no rompe la corrida y queda auditado", async () => {
    routes["https://cerrado.example/"] = { status: 403 };
    await addSource("cerrado", { website: "https://cerrado.example/" });
    const run = await runOnly("cerrado", "operadora-uno");
    expect(run.body.sourcesChecked).toBe(2);
    const st = await request(app).get("/api/sources/cerrado/checks").set(staff);
    expect(st.body.items[0].status).toBe("ACCESS_RESTRICTED");
  });

  it("no consulta Facebook/Instagram sin credenciales", async () => {
    await addSource("solo-fb", { facebook: "https://www.facebook.com/solofb123" });
    const before = calls.length;
    await runOnly("solo-fb");
    expect(calls.length).toBe(before);
    const st = await request(app).get("/api/sources/solo-fb/checks").set(staff);
    expect(st.body.items[0].status).toBe("AUTH_REQUIRED");
  });
});

describe("conexiones a Meta y Graph API", () => {
  it("solo ADMIN; el token se guarda cifrado y nunca se devuelve", async () => {
    const body = { provider: "facebook", externalId: "app-1", token: "EAAB-token-super-secreto-123", label: "Mi app" };
    await request(app).post("/api/connections").set(staff).send(body).expect(403);
    const ok = await request(app).post("/api/connections").set(admin).send(body).expect(201);
    expect(JSON.stringify(ok.body)).not.toContain("secreto");
    expect(ok.body).not.toHaveProperty("tokenEnc");
    const listed = await request(app).get("/api/connections").set(admin).expect(200);
    expect(JSON.stringify(listed.body)).not.toContain("secreto");
    const [row] = await handle.db.select().from(connections).where(eq(connections.provider, "facebook"));
    expect(row!.tokenEnc).toMatch(/^v1\./);
    expect(row!.tokenEnc).not.toContain("secreto");
  });

  it("Facebook con credenciales usa Graph API y guarda el permalink real", async () => {
    routes = {};
    const graph = Object.assign(new URL("https://graph.facebook.com/v21.0/nicaroad-test/posts"));
    const key = () => Object.keys(routes).find((k) => k.startsWith(graph.toString()));
    routes[graph.toString() + "?fields=message%2Cpermalink_url%2Ccreated_time%2Cfull_picture&limit=15&access_token=EAAB-token-super-secreto-123"] = {
      body: JSON.stringify({ data: [{ message: "🎸 Tributo a Metallica\nViernes 25 de septiembre 8:00 PM en Ron Kon Rolas. Entrada C$200", permalink_url: "https://www.facebook.com/nicaroad-test/posts/999", created_time: "2026-09-23T10:00:00+0000" }] }),
    };
    void key;
    await addSource("nicaroad-test", { facebook: "https://www.facebook.com/nicaroad-test" }, { city: "Managua" });
    const run = await runOnly("nicaroad-test");
    expect(run.body).toMatchObject({ eventsFound: 1, newEvents: 1 });
    const ev = (await list()).body.items.find((e: { title: string }) => e.title === "Tributo a Metallica");
    expect(ev).toMatchObject({ category: "rock", venue: "Ron Kon Rolas" });
    expect(ev.sources[0]).toMatchObject({ platform: "facebook", urlKind: "EVENT_SOURCE_URL", originalPostUrl: "https://www.facebook.com/nicaroad-test/posts/999" });
    const chk = await request(app).get("/api/sources/nicaroad-test/checks").set(staff);
    expect(JSON.stringify(chk.body)).not.toContain("secreto");
  });

  it("un token vencido se audita como AUTH_REQUIRED y marca la conexión", async () => {
    routes = { [Object.keys(routes)[0] ?? "x"]: { status: 400, body: JSON.stringify({ error: { code: 190, message: "expired" } }) } };
    await runOnly("nicaroad-test");
    const chk = await request(app).get("/api/sources/nicaroad-test/checks").set(staff);
    expect(chk.body.items[0].status).toBe("AUTH_REQUIRED");
    const conns = await request(app).get("/api/connections").set(admin);
    expect(conns.body.items[0].lastError).toMatch(/inválido|vencido/);
  });
});

describe("alta manual de eventos", () => {
  it("desde texto pegado", async () => {
    const r = await request(app).post("/api/events/from-source-content").set(staff)
      .send({ text: "Noche de Salsa y Bachata, sábado 26 de septiembre 7:00 PM en Salón Colonial. Entrada C$150", organizer: "Academia Ritmo", city: "Managua" }).expect(201);
    expect(r.body.items[0]).toMatchObject({ created: true, title: "Noche de Salsa y Bachata", confidence: "HIGH" });
    const ev = (await list()).body.items.find((e: { id: string }) => e.id === r.body.items[0].id);
    expect(ev.sources[0]).toMatchObject({ originalPostUrl: null, urlKind: "PROFILE_URL" }); // sin enlace directo
  });

  it("desde una URL pública, conservándola como enlace original", async () => {
    routes["https://eventos.example/tributo"] = { body: html(ld({ "@type": "Event", name: "Festival de Jazz", startDate: "2026-09-30T19:00:00-06:00", location: { name: "Café del Centro" } })) };
    const r = await request(app).post("/api/events/from-source-content").set(staff).send({ url: "https://eventos.example/tributo", city: "León" }).expect(201);
    const ev = (await list()).body.items.find((e: { id: string }) => e.id === r.body.items[0].id);
    expect(ev.sources[0].originalPostUrl).toBe("https://eventos.example/tributo");
  });

  it("rechaza texto sin fecha, URLs internas (SSRF) y permisos insuficientes", async () => {
    await request(app).post("/api/events/from-source-content").set(staff).send({ text: "Gracias por acompañarnos anoche, qué gran noche" }).expect(422);
    const ssrf = await request(app).post("/api/events/from-source-content").set(staff).send({ url: "http://127.0.0.1:4000/api/users" }).expect(422);
    expect(ssrf.body.error.code).toBe("ACCESS_RESTRICTED");
    await request(app).post("/api/events/from-source-content").send({ text: "Salsa 26 sept 7pm en algún lugar" }).expect(401);
    await request(app).post("/api/events/from-source-content").set(staff).send({ url: "https://x.example/", text: "Salsa 26 sept 7pm en algún lugar" }).expect(400);
  });
});

describe("fusión manual de duplicados", () => {
  it("mueve las fuentes al evento destino y elimina el duplicado", async () => {
    const a = (await request(app).post("/api/events/from-source-content").set(staff).send({ text: "Cata de café y cacao, domingo 4 de octubre 3:00 PM en Finca Los Volcanes. US$25", organizer: "Café Ruta", city: "Rivas" }).expect(201)).body.items[0];
    const b = (await request(app).post("/api/events/from-source-content").set(staff).send({ text: "Degustación de cafés de altura y chocolate el 4 de octubre 3 PM Finca Volcanes US$25", organizer: "Otra Cuenta", city: "Rivas", publish: true }).expect(201)).body.items[0];
    if (a.id === b.id) return; // la deduplicación automática ya los unió: nada que fusionar
    await request(app).post(`/api/events/${b.id}/merge`).send({ intoId: a.id }).expect(401);
    await request(app).post(`/api/events/${b.id}/merge`).set(staff).send({ intoId: b.id }).expect(400);
    const merged = await request(app).post(`/api/events/${b.id}/merge`).set(staff).send({ intoId: a.id }).expect(200);
    expect(merged.body.sources.length).toBeGreaterThanOrEqual(2);
    await request(app).get(`/api/events/${b.id}`).set(staff).expect(404);
  });
});
