// Graph API SIMULADA para las pruebas E2E del flujo "Conectar con Meta". Sin red real ni credenciales.
import { createServer } from "node:http";

const port = Number(process.env.FAKE_META_PORT ?? 4300);
const SHORT = "SHORT-token-e2e-0123456789";
const LONG = "LONG-token-e2e-0123456789";

createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const send = (status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const p = u.pathname.replace(/^\/v[\d.]+\//, "/");
  if (p === "/health") return send(200, { ok: true });
  if (p === "/oauth/access_token") {
    if (u.searchParams.get("grant_type") === "fb_exchange_token") {
      return u.searchParams.get("fb_exchange_token") === SHORT ? send(200, { access_token: LONG, expires_in: 5184000 }) : send(400, { error: { code: 190, message: "bad token" } });
    }
    return u.searchParams.get("code") === "CODE-VALIDO" ? send(200, { access_token: SHORT, expires_in: 3600 }) : send(400, { error: { code: 100, message: "Invalid code" } });
  }
  if (p === "/debug_token") {
    return send(200, { data: { is_valid: u.searchParams.get("input_token") === LONG, user_id: "fb-e2e", scopes: ["pages_show_list", "instagram_basic", "pages_read_engagement"], expires_at: Math.floor(Date.now() / 1000) + 60 * 86400 } });
  }
  if (p === "/me") return send(200, { id: "fb-e2e", name: "Julio Prueba" });
  if (p === "/me/accounts") return send(200, { data: [{ id: "p1", name: "Mi Página E2E", instagram_business_account: { id: "1784001", username: "miig_e2e" } }] });
  send(404, { error: { message: "no existe" } });
}).listen(port, () => console.log(`Graph API simulada en :${port}`));
