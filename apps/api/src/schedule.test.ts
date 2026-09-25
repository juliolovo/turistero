import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { checkDecision, seedSources, sources, type DbHandle } from "@turistero/db";
import { createTestDb } from "@turistero/db/src/testing";
import { createSafeFetcher } from "@turistero/discovery";
import { createApp } from "./app";
import { isDueToday, userDue } from "./tick";

/* ---------- política de cortesía (pura) ---------- */
describe("checkDecision", () => {
  const now = new Date("2026-09-25T12:00:00Z");
  const at = (min: number) => new Date(now.getTime() - min * 60_000);

  it("sin revisiones previas: se puede", () => {
    expect(checkDecision([], now)).toEqual({ ok: true, retry: false });
  });
  it("una revisión al día por fuente", () => {
    const d = checkDecision([{ startedAt: at(30), status: "SUCCESS" }], now);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.retryAt.getTime()).toBe(at(30).getTime() + 24 * 3_600_000);
  });
  it("tras 24 h vuelve a permitirse", () => {
    expect(checkDecision([{ startedAt: at(24 * 60 + 1), status: "SUCCESS" }], now).ok).toBe(true);
  });
  it("si falló por algo transitorio: reintento a la hora, no antes", () => {
    expect(checkDecision([{ startedAt: at(30), status: "ERROR" }], now).ok).toBe(false);
    expect(checkDecision([{ startedAt: at(61), status: "ERROR" }], now)).toEqual({ ok: true, retry: true });
    expect(checkDecision([{ startedAt: at(61), status: "RATE_LIMITED" }], now)).toEqual({ ok: true, retry: true });
  });
  it("máximo 2 intentos por ventana", () => {
    const d = checkDecision([{ startedAt: at(200), status: "ERROR" }, { startedAt: at(120), status: "ERROR" }], now);
    expect(d.ok).toBe(false);
  });
  it("AUTH_REQUIRED, ACCESS_RESTRICTED y NOT_FOUND no se reintentan: no se arreglan solos", () => {
    expect(checkDecision([{ startedAt: at(90), status: "AUTH_REQUIRED" }], now).ok).toBe(false);
    expect(checkDecision([{ startedAt: at(90), status: "ACCESS_RESTRICTED" }], now).ok).toBe(false);
    expect(checkDecision([{ startedAt: at(90), status: "NOT_FOUND" }], now).ok).toBe(false);
  });
});

/* ---------- horarios ---------- */
describe("horarios", () => {
  const sched = (o: Partial<Parameters<typeof userDue>[1]> = {}) => ({ enabled: true, days: [1, 3, 5], hour: 5, minute: 15, timezone: "America/Managua", lastRunAt: null, ...o });
  it("viernes 05:15 Managua = 11:15 UTC", () => {
    expect(userDue(new Date("2026-09-25T11:14:00Z"), sched())).toBe(false);
    expect(userDue(new Date("2026-09-25T11:15:00Z"), sched())).toBe(true);
  });
  it("solo los días elegidos y una vez por día", () => {
    expect(userDue(new Date("2026-09-24T15:00:00Z"), sched())).toBe(false); // jueves
    expect(userDue(new Date("2026-09-25T15:00:00Z"), sched({ lastRunAt: new Date("2026-09-25T11:20:00Z") }))).toBe(false);
    expect(userDue(new Date("2026-09-25T15:00:00Z"), sched({ lastRunAt: new Date("2026-09-23T11:20:00Z") }))).toBe(true);
  });
  it("respeta la zona horaria del usuario y el interruptor", () => {
    // 21:00 Tokio (UTC+9) del viernes = 12:00Z
    expect(userDue(new Date("2026-09-25T12:00:00Z"), sched({ timezone: "Asia/Tokyo", hour: 20, minute: 0 }))).toBe(true);
    expect(userDue(new Date("2026-09-25T12:00:00Z"), sched({ timezone: "Asia/Tokyo", hour: 22, minute: 0 }))).toBe(false);
    expect(userDue(new Date("2026-09-25T12:00:00Z"), sched({ enabled: false }))).toBe(false);
  });
  it("isDueToday usa el día local", () => {
    expect(isDueToday(new Date("2026-09-26T05:00:00Z"), { timeZone: "America/Managua", days: [5], hour: 5, minute: 15 })).toBe(true); // aún viernes en Managua
  });
});

/* ---------- planificador de punta a punta ---------- */
type Route = { status?: number; body?: string };
const routes: Record<string, Route> = {};
const fetchImpl = (async (input: URL | string) => {
  const r = routes[input.toString()] ?? { status: 404, body: "" };
  return new Response(r.body ?? "", { status: r.status ?? 200 });
}) as unknown as typeof fetch;
const ld = (name: string, start: string) => `<html><head><script type="application/ld+json">${JSON.stringify({ "@type": "Event", name, startDate: start, location: { name: "Salida desde León" } })}</script></head></html>`;

const ana = { "x-dev-user": "ana:USER" };
const beto = { "x-dev-user": "beto:USER" };
const CRON = { authorization: "Bearer cron-secret-de-prueba-1234567890" };
let clock = new Date("2026-09-24T18:00:00Z"); // jueves
let handle: DbHandle;
let app: ReturnType<typeof createApp>;

const tick = () => request(app).get("/api/cron/discovery").set(CRON).expect(200);
const notifs = (who: Record<string, string>) => request(app).get("/api/my/notifications").set(who).expect(200);

beforeAll(async () => {
  process.env.CRON_SECRET = "cron-secret-de-prueba-1234567890";
  handle = await createTestDb();
  await seedSources(handle.db);
  app = createApp({
    db: handle.db, allowDevAuth: true, now: () => clock,
    fetcher: createSafeFetcher({ fetchImpl, resolveHost: async () => ["93.184.216.34"], hostDelayMs: 0 }),
    logger: (await import("pino")).pino({ level: "silent" }),
  });
}, 60_000);
afterAll(() => handle.close());

describe("planificador (GET /api/cron/discovery)", () => {
  it("exige CRON_SECRET", async () => {
    await request(app).get("/api/cron/discovery").expect(401);
    await request(app).get("/api/cron/discovery").set("authorization", "Bearer incorrecto-incorrecto-incorrecto").expect(401);
  });

  it("un jueves no hay nada programado: no revisa nada", async () => {
    routes["https://ana.example/"] = { body: ld("Tour de Ana", "2026-09-27T06:00:00-06:00") };
    await request(app).post("/api/my/sources").set(ana).send({ name: "Ana Tours", city: "León", urls: { website: "https://ana.example/" } }).expect(201);
    const r = await tick();
    expect(r.body).toMatchObject({ run: null, checked: 0, globalDue: false });
  });

  it("el viernes (tras las 05:15 de Managua) revisa el catálogo y las fuentes de quien tiene el horario predeterminado", async () => {
    clock = new Date("2026-09-25T12:00:00Z");
    const r = await tick();
    expect(r.body.globalDue).toBe(true);
    expect(r.body.users).toBe(1);
    expect(r.body.checked).toBeGreaterThan(20); // catálogo (22 fuentes) + la de Ana
    expect(r.body.newEvents).toBe(1);
    const runs = await request(app).get("/api/discovery-runs").set({ "x-dev-user": "ed:EDITOR" }).expect(200);
    expect(runs.body.items[0]).toMatchObject({ trigger: "CRON", status: expect.stringMatching(/COMPLETED|PARTIAL/) });
  });

  it("es idempotente: una segunda pasada el mismo día no repite nada (una vez al día por fuente)", async () => {
    clock = new Date("2026-09-25T13:00:00Z");
    const r = await tick();
    expect(r.body).toMatchObject({ run: null, checked: 0 });
  });

  it("la persona recibe avisos: revisión iniciada y eventos nuevos", async () => {
    const n = await notifs(ana);
    const kinds = n.body.items.map((x: { kind: string }) => x.kind);
    expect(kinds).toEqual(expect.arrayContaining(["SCAN_STARTED", "NEW_EVENTS"]));
    expect(n.body.items.find((x: { kind: string }) => x.kind === "SCAN_STARTED").message).toMatch(/revisando ahora/i);
    expect(n.body.unread).toBe(2);
    expect((await request(app).get("/api/my/notifications/unread-count").set(ana)).body.unread).toBe(2);
    expect((await notifs(beto)).body.items).toEqual([]); // los avisos son personales
    await request(app).post("/api/my/notifications/read").set(ana).expect(204);
    expect((await notifs(ana)).body.unread).toBe(0);
    await request(app).get("/api/my/notifications").expect(401);
  });

  it("cada persona configura su horario (días, hora, zona) y solo se revisa cuando le toca", async () => {
    routes["https://beto.example/"] = { body: ld("Tour de Beto", "2026-09-30T06:00:00-06:00") };
    await request(app).post("/api/my/sources").set(beto).send({ name: "Beto Tours", city: "León", urls: { website: "https://beto.example/" } }).expect(201);
    const def = await request(app).get("/api/my/schedule").set(beto).expect(200);
    expect(def.body).toMatchObject({ enabled: true, days: [1, 3, 5], hour: 5, minute: 15 });

    await request(app).put("/api/my/schedule").set(beto).send({ enabled: true, days: [2], hour: 8, minute: 0, timezone: "America/Managua" }).expect(200);
    clock = new Date("2026-09-25T20:00:00Z"); // viernes: no es su día
    expect((await tick()).body).toMatchObject({ checked: 0 });

    clock = new Date("2026-09-29T13:00:00Z"); // martes 07:00 Managua: aún no es su hora
    expect((await tick()).body.checked).toBe(0);
    clock = new Date("2026-09-29T15:00:00Z"); // martes 09:00 Managua
    const r = await tick();
    expect(r.body.users).toBe(1);
    expect(r.body.newEvents).toBe(1);
    expect((await notifs(beto)).body.items.map((x: { kind: string }) => x.kind)).toContain("NEW_EVENTS");
  });

  it("puede pausar su revisión automática y valida el horario", async () => {
    await request(app).put("/api/my/schedule").set(ana).send({ enabled: false, days: [1], hour: 5, minute: 15 }).expect(200);
    await request(app).put("/api/my/schedule").set(ana).send({ enabled: true, days: [], hour: 5, minute: 15 }).expect(400);
    await request(app).put("/api/my/schedule").set(ana).send({ enabled: true, days: [9], hour: 5, minute: 15 }).expect(400);
    await request(app).put("/api/my/schedule").set(ana).send({ enabled: true, days: [1], hour: 25, minute: 15 }).expect(400);
    await request(app).put("/api/my/schedule").set(ana).send({ enabled: true, days: [1], hour: 5, minute: 15, timezone: "Marte/Olimpo" }).expect(400);
    await request(app).put("/api/my/schedule").send({ enabled: true, days: [1], hour: 5, minute: 15 }).expect(401);
    await request(app).put("/api/my/schedule").set(ana).send({ enabled: false, days: [1, 3, 5], hour: 5, minute: 15 }).expect(200);
  });

  it("si falla, se reintenta una vez pasada 1 hora (y no más)", async () => {
    routes["https://caida.example/"] = { status: 500, body: "" };
    const who = { "x-dev-user": "carla:USER" };
    await request(app).post("/api/my/sources").set(who).send({ name: "Sitio Caido", city: "León", urls: { website: "https://caida.example/" } }).expect(201);
    clock = new Date("2026-10-02T12:00:00Z"); // viernes siguiente
    await tick(); // intento 1 (falla)
    const first = await request(app).get("/api/my/sources").set(who);
    expect(first.body.private[0]).toMatchObject({ lastStatus: "ERROR" });

    clock = new Date("2026-10-02T12:30:00Z");
    expect((await tick()).body.checked).toBe(0); // demasiado pronto
    clock = new Date("2026-10-02T13:05:00Z");
    expect((await tick()).body.checked).toBe(1); // reintento
    clock = new Date("2026-10-02T15:00:00Z");
    expect((await tick()).body.checked).toBe(0); // 2 intentos ya: se acabó por hoy
    const notes = await notifs(who);
    expect(notes.body.items.some((n: { kind: string }) => n.kind === "SCAN_FAILED")).toBe(true);
  });
});

describe("Buscar ahora (manual) con la misma cortesía", () => {
  it("una vez por fuente al día y con aviso claro", async () => {
    clock = new Date("2026-10-06T15:00:00Z");
    routes["https://dani.example/"] = { body: ld("Tour de Dani", "2026-10-09T06:00:00-06:00") };
    const who = { "x-dev-user": "dani:USER" };
    const s = await request(app).post("/api/my/sources").set(who).send({ name: "Dani Tours", city: "León", urls: { website: "https://dani.example/" } }).expect(201);
    await request(app).post(`/api/my/sources/${s.body.id}/check`).set(who).expect(201);
    const again = await request(app).post(`/api/my/sources/${s.body.id}/check`).set(who).expect(429);
    expect(again.body.error.message).toMatch(/máximo una vez cada 24 h/);
    const list = await request(app).get("/api/my/sources").set(who);
    expect(list.body.private[0].nextCheckAt).toBeTruthy();
    clock = new Date("2026-10-07T15:30:00Z"); // pasadas 24 h
    await request(app).post(`/api/my/sources/${s.body.id}/check`).set(who).expect(201);
  });

  it("muestra 'revisando ahora' y no permite dos revisiones a la vez", async () => {
    clock = new Date("2026-10-20T15:00:00Z");
    routes["https://eli.example/"] = { body: ld("Tour de Eli", "2026-10-22T06:00:00-06:00") };
    const who = { "x-dev-user": "eli:USER" };
    const s = await request(app).post("/api/my/sources").set(who).send({ name: "Eli Tours", city: "León", urls: { website: "https://eli.example/" } }).expect(201);
    await handle.db.update(sources).set({ scanningSince: new Date(clock.getTime() - 60_000) }).where(eq(sources.id, s.body.id));
    expect((await request(app).get("/api/my/sources").set(who)).body.private[0].scanning).toBe(true);
    await request(app).post(`/api/my/sources/${s.body.id}/check`).set(who).expect(409);
    // una marca vieja (proceso que murió) no bloquea para siempre
    await handle.db.update(sources).set({ scanningSince: new Date(clock.getTime() - 30 * 60_000) }).where(eq(sources.id, s.body.id));
    expect((await request(app).get("/api/my/sources").set(who)).body.private[0].scanning).toBe(false);
    await request(app).post(`/api/my/sources/${s.body.id}/check`).set(who).expect(201);
    expect((await handle.db.select().from(sources).where(eq(sources.id, s.body.id)))[0]!.scanningSince).toBeNull(); // se limpia al terminar
  });
});
