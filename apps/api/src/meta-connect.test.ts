import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { connections, createDb, getCredential, notifications, type DbHandle } from "@turistero/db";
import { createApp } from "./app";
import { warnExpiringConnections } from "./tick";

const APP_ID = "1234567890", APP_SECRET = "app-secret-de-prueba-abc";
const SHORT = "SHORT-token-de-prueba-0123456789", LONG = "LONG-token-de-prueba-0123456789";
const admin = { "x-dev-user": "boss:ADMIN" };
const editor = { "x-dev-user": "ed:EDITOR" };
const REDIRECT = "https://turistero.example/admin/connections/meta/callback";

/** Meta simulada. `scenario` cambia lo que responde. */
let scenario: { scopes: string[]; pages: object[]; codeOk: boolean; valid: boolean; expiresInDays: number } = { scopes: [], pages: [], codeOk: true, valid: true, expiresInDays: 60 };
const calls: string[] = [];
const metaFetch = (async (input: URL | string) => {
  const u = new URL(input.toString());
  calls.push(u.pathname + "?" + [...u.searchParams.keys()].join(","));
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
  const p = u.pathname.replace(/^\/v[\d.]+\//, "/");
  if (p === "/oauth/access_token") {
    if (u.searchParams.get("grant_type") === "fb_exchange_token") {
      return u.searchParams.get("fb_exchange_token") === SHORT ? json(200, { access_token: LONG, expires_in: 5184000 }) : json(400, { error: { code: 190, message: "bad" } });
    }
    return scenario.codeOk && u.searchParams.get("code") === "CODE-VALIDO" && u.searchParams.get("redirect_uri") === REDIRECT
      ? json(200, { access_token: SHORT, expires_in: 3600 })
      : json(400, { error: { code: 100, message: "Invalid verification code format" } });
  }
  if (p === "/debug_token") {
    return json(200, { data: { is_valid: scenario.valid, user_id: "fb-user-1", scopes: scenario.scopes, expires_at: Math.floor(Date.now() / 1000) + scenario.expiresInDays * 86400 } });
  }
  if (p === "/me") return json(200, { id: "fb-user-1", name: "Julio Prueba" });
  if (p === "/me/accounts") return json(200, { data: scenario.pages });
  return json(404, { error: { message: "no" } });
}) as unknown as typeof fetch;

let handle: DbHandle;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  Object.assign(process.env, { META_APP_ID: APP_ID, META_APP_SECRET: APP_SECRET, TOKEN_ENCRYPTION_KEY: "clave-de-prueba-suficientemente-larga" });
  handle = await createDb({ migrate: true });
  app = createApp({ db: handle.db, allowDevAuth: true, metaFetch, logger: (await import("pino")).pino({ level: "silent" }) });
}, 60_000);
afterAll(() => handle.close());

const connect = (code = "CODE-VALIDO", redirectUri = REDIRECT, who: Record<string, string> = admin) => request(app).post("/api/meta/connect").set(who).send({ code, redirectUri });
const rows = () => handle.db.select().from(connections);

describe("Conectar con Meta", () => {
  it("solo ADMIN, con datos válidos y con la app configurada", async () => {
    await request(app).post("/api/meta/connect").send({ code: "CODE-VALIDO", redirectUri: REDIRECT }).expect(401);
    await connect("CODE-VALIDO", REDIRECT, editor).expect(403);
    await connect("x", REDIRECT).expect(400); // código demasiado corto
    await connect("CODE-VALIDO", "javascript:alert(1)").expect(400);
    const status = await request(app).get("/api/meta/status").set(admin).expect(200);
    expect(status.body.configured).toBe(true);
  });

  it("flujo completo: token de larga duración, Página e Instagram detectados y todo guardado cifrado", async () => {
    scenario = {
      ...scenario, scopes: ["public_profile", "pages_show_list", "instagram_basic"], expiresInDays: 60,
      pages: [
        { id: "p1", name: "Mi Página", instagram_business_account: { id: "1784", username: "miig" } },
        { id: "p2", name: "Otra Página" },
      ],
    };
    const res = await connect().expect(200);
    expect(res.body).toMatchObject({
      facebook: { userId: "fb-user-1", name: "Julio Prueba" },
      instagram: [{ id: "1784", username: "miig", page: "Mi Página" }],
      pages: [{ id: "p1" }, { id: "p2" }],
      warnings: [],
    });
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now() + 59 * 86400_000);

    // el código y el secreto se usan solo en el servidor; los tokens jamás salen en la respuesta
    const body = JSON.stringify(res.body);
    for (const secret of [SHORT, LONG, APP_SECRET, "CODE-VALIDO"]) expect(body).not.toContain(secret);

    const saved = await rows();
    expect(saved.map((r) => `${r.provider}:${r.externalId}`).sort()).toEqual(["facebook:fb-user-1", "instagram:1784"]);
    for (const r of saved) {
      expect(r.tokenEnc).toMatch(/^v1\./);
      expect(r.tokenEnc).not.toContain(LONG);
      expect(r.scope).toContain("instagram_basic");
    }
    // y el descubrimiento puede usarlas (descifradas solo en memoria)
    expect((await getCredential(handle.db, "instagram"))?.token).toBe(LONG);
    expect((await getCredential(handle.db, "facebook"))?.externalId).toBe("fb-user-1");
  });

  it("reconectar actualiza las conexiones, no las duplica", async () => {
    await connect().expect(200);
    expect(await rows()).toHaveLength(2);
    const list = await request(app).get("/api/connections").set(admin).expect(200);
    expect(JSON.stringify(list.body)).not.toContain(LONG);
    expect(JSON.stringify(list.body)).not.toContain("tokenEnc");
  });

  it("un código inválido o vencido se explica y no guarda nada nuevo", async () => {
    const before = await rows();
    const bad = await connect("CODIGO-EXPIRADO").expect(502);
    expect(bad.body.error.code).toBe("ACCESS_RESTRICTED");
    expect(JSON.stringify(bad.body)).not.toContain(APP_SECRET); // el mensaje nunca incluye la URL ni el secreto
    const wrongUri = await connect("CODE-VALIDO", "https://otro.example/callback").expect(502);
    expect(wrongUri.body.error.message).toBeTruthy();
    expect(await rows()).toHaveLength(before.length);
  });

  it("avisa cuando faltan permisos o no hay Página / Instagram", async () => {
    await handle.db.delete(connections);
    scenario = { ...scenario, scopes: ["public_profile"], pages: [] };
    const res = await connect().expect(200);
    expect(res.body.warnings.join(" ")).toMatch(/pages_show_list/);
    expect(res.body.warnings.join(" ")).toMatch(/instagram_basic/);
    expect(res.body.warnings.join(" ")).toMatch(/No administras ninguna Página/);
    expect(res.body.instagram).toEqual([]);
    expect((await rows()).map((r) => r.provider)).toEqual(["facebook"]); // al menos el login/lectura de Facebook queda guardado

    scenario = { ...scenario, scopes: ["pages_show_list", "instagram_basic"], pages: [{ id: "p9", name: "Sin IG" }] };
    const r2 = await connect().expect(200);
    expect(r2.body.warnings.join(" ")).toMatch(/Ninguna de tus Páginas tiene una cuenta de Instagram/);
  });

  it("sin META_APP_ID/SECRET responde 503 claro", async () => {
    const keep = process.env.META_APP_SECRET;
    delete process.env.META_APP_SECRET;
    const r = await connect().expect(503);
    expect(r.body.error.code).toBe("NOT_CONFIGURED");
    expect((await request(app).get("/api/meta/status").set(admin)).body.configured).toBe(false);
    process.env.META_APP_SECRET = keep;
  });
});

describe("probar una conexión", () => {
  it("válida: devuelve permisos y vencimiento y limpia el error", async () => {
    await handle.db.delete(connections);
    scenario = { ...scenario, scopes: ["pages_show_list", "instagram_basic"], pages: [{ id: "p1", name: "P", instagram_business_account: { id: "1784", username: "miig" } }], valid: true };
    await connect().expect(200);
    const [c] = await rows();
    const ok = await request(app).post(`/api/meta/connections/${c!.id}/test`).set(admin).expect(200);
    expect(ok.body).toMatchObject({ valid: true, scopes: ["pages_show_list", "instagram_basic"] });
    expect((await rows())[0]!.lastError).toBeNull();
  });

  it("token revocado: lo detecta y lo marca para reconectar", async () => {
    scenario = { ...scenario, valid: false };
    const [c] = await rows();
    const bad = await request(app).post(`/api/meta/connections/${c!.id}/test`).set(admin).expect(200);
    expect(bad.body.valid).toBe(false);
    const [after] = await handle.db.select().from(connections).where(eq(connections.id, c!.id));
    expect(after!.lastError).toMatch(/vuelve a conectar/i);
    scenario = { ...scenario, valid: true };
  });

  it("solo ADMIN y la conexión debe existir", async () => {
    const [c] = await rows();
    await request(app).post(`/api/meta/connections/${c!.id}/test`).set(editor).expect(403);
    await request(app).post("/api/meta/connections/no-existe/test").set(admin).expect(404);
  });
});

describe("aviso de vencimiento", () => {
  it("avisa una sola vez al día cuando el token vence en menos de 7 días o ya venció", async () => {
    await handle.db.delete(connections);
    scenario = { ...scenario, expiresInDays: 3, scopes: ["pages_show_list"], pages: [] };
    await connect().expect(200);
    const now = new Date();
    expect(await warnExpiringConnections(handle.db, now)).toBe(1);
    expect(await warnExpiringConnections(handle.db, now)).toBe(0); // ya avisó hoy
    const n = await handle.db.select().from(notifications);
    expect(n.some((x) => /vence en \d+ día/.test(x.message))).toBe(true);
    // vencido
    expect(await warnExpiringConnections(handle.db, new Date(now.getTime() + 10 * 86400_000))).toBe(1);
    expect((await handle.db.select().from(notifications)).some((x) => /venció/.test(x.message))).toBe(true);
  });

  it("no avisa si falta mucho", async () => {
    await handle.db.delete(notifications);
    expect(await warnExpiringConnections(handle.db, new Date(Date.now() - 30 * 86400_000))).toBe(0);
  });
});
