import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error módulo .mjs sin tipos
import { run } from "./check-meta.mjs";
// @ts-expect-error módulo .mjs sin tipos
import { exchange } from "./long-lived-token.mjs";
// @ts-expect-error módulo .mjs sin tipos
import { diagnose, parseArgs, redact } from "./meta-lib.mjs";

/** Graph API simulada: sin red real ni credenciales. */
let server: Server;
let base = "";
const TOKEN = "EAAB-token-super-secreto-1234567890";
const SECRET = "app-secret-de-prueba-abc";

beforeAll(async () => {
  server = createServer((req, res) => {
    const u = new URL(req.url!, "http://x");
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (u.pathname.endsWith("/debug_token")) {
      return send(200, { data: { is_valid: u.searchParams.get("input_token") === TOKEN, type: "USER", application: "Turistero", expires_at: Math.floor(Date.now() / 1000) + 30 * 86400, scopes: ["pages_show_list", "instagram_basic"] } });
    }
    if (u.pathname.endsWith("/me/accounts")) return send(200, { data: [{ id: "111", name: "Mi Página", instagram_business_account: { id: "1784", username: "miig" } }] });
    if (u.pathname.endsWith("/1784")) {
      const f = u.searchParams.get("fields") ?? "";
      if (f.includes("username(privada)")) return send(400, { error: { code: 100, message: "Invalid user id" } });
      return send(200, { business_discovery: { username: "ronkonrolas", media_count: 10, media: { data: [{ permalink: "https://www.instagram.com/p/ABC/", timestamp: "2026-09-20T10:00:00+0000", media_type: "IMAGE" }] } } });
    }
    if (u.pathname.endsWith("/ajena/posts")) return send(403, { error: { code: 10, message: "Application does not have permission for this action" } });
    if (u.pathname.endsWith("/oauth/access_token")) {
      return u.searchParams.get("fb_exchange_token") === "corto" ? send(200, { access_token: "LARGO-token-0123456789", expires_in: 5184000 }) : send(400, { error: { code: 190, message: "bad" } });
    }
    send(404, { error: { message: "not found" } });
  });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  process.env.META_GRAPH_BASE = base;
});
afterAll(() => server.close());

const env = () => ({ META_APP_ID: "123", META_APP_SECRET: SECRET, META_ACCESS_TOKEN: TOKEN });
const capture = () => {
  const lines: string[] = [];
  return { lines, out: (m: string) => lines.push(m), text: () => lines.join("\n") };
};

describe("check-meta", () => {
  it("valida el token, lista Páginas y muestra el IG User ID", async () => {
    const c = capture();
    expect(await run(env(), [], c.out)).toBe(0);
    expect(c.text()).toMatch(/válido: true/);
    expect(c.text()).toMatch(/pages_show_list, instagram_basic/);
    expect(c.text()).toMatch(/IG User ID = 1784/);
  });

  it("Business Discovery devuelve las últimas publicaciones", async () => {
    const c = capture();
    expect(await run(env(), ["--ig-user-id", "1784", "--discover", "ronkonrolas"], c.out)).toBe(0);
    expect(c.text()).toMatch(/@ronkonrolas: 10 publicaciones/);
    expect(c.text()).toMatch(/instagram\.com\/p\/ABC/);
  });

  it("una cuenta no profesional/privada se explica, no revienta", async () => {
    const c = capture();
    expect(await run(env(), ["--ig-user-id", "1784", "--discover", "privada"], c.out)).toBe(1);
    expect(c.text()).toMatch(/ACCESS_RESTRICTED.*no es una cuenta profesional/);
  });

  it("leer una Página ajena sin Page Public Content Access explica qué falta", async () => {
    const c = capture();
    expect(await run(env(), ["--page", "ajena"], c.out)).toBe(1);
    expect(c.text()).toMatch(/Page Public Content Access/);
  });

  it("un token inválido se detecta", async () => {
    const c = capture();
    expect(await run({ ...env(), META_ACCESS_TOKEN: "otro-token-invalido" }, [], c.out)).toBe(1);
  });

  it("nunca imprime el token ni el secreto", async () => {
    const c = capture();
    await run(env(), ["--ig-user-id", "1784", "--discover", "ronkonrolas", "--page", "ajena"], c.out);
    expect(c.text()).not.toContain(TOKEN);
    expect(c.text()).not.toContain(SECRET);
  });

  it("sin variables, pide lo que falta", async () => {
    const c = capture();
    expect(await run({}, [], c.out)).toBe(2);
    expect(c.text()).toMatch(/META_APP_ID/);
  });
});

describe("long-lived-token", () => {
  it("cambia el token corto por uno largo (salida estándar solo el token)", async () => {
    const out: string[] = [], err: string[] = [];
    expect(await exchange({ META_APP_ID: "1", META_APP_SECRET: SECRET }, ["corto"], (m: string) => out.push(m), (m: string) => err.push(m))).toBe(0);
    expect(out).toEqual(["LARGO-token-0123456789"]);
    expect(err.join(" ")).toMatch(/~60 días/);
  });
  it("token inválido: error claro y sin filtrar secretos", async () => {
    const err: string[] = [];
    expect(await exchange({ META_APP_ID: "1", META_APP_SECRET: SECRET }, ["malo"], () => {}, (m: string) => err.push(m))).toBe(1);
    expect(err.join(" ")).toMatch(/AUTH_REQUIRED/);
    expect(err.join(" ")).not.toContain(SECRET);
  });
});

describe("meta-lib", () => {
  it("diagnose traduce códigos a estados", () => {
    expect(diagnose({ code: 190 }).status).toBe("AUTH_REQUIRED");
    expect(diagnose({ code: 4 }).status).toBe("RATE_LIMITED");
    expect(diagnose({ code: 10 }).status).toBe("ACCESS_RESTRICTED");
    expect(diagnose({ code: 999, message: "x" }).status).toBe("ERROR");
  });
  it("parseArgs y redact", () => {
    expect(parseArgs(["--a", "1", "--flag", "--b", "2", "x"])).toEqual({ _: ["x"], a: "1", flag: true, b: "2" });
    expect(redact("token=ABCDEFGH y ABCDEFGH", ["ABCDEFGH"])).toBe("token=«oculto» y «oculto»");
  });
});
