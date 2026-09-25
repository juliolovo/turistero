#!/usr/bin/env node
// Cambia un token de usuario de corta duración (~1 h) por uno de larga duración (~60 días).
//
//   META_APP_ID=... META_APP_SECRET=... node meta-app/scripts/long-lived-token.mjs <token-corto>
//
// Imprime el token nuevo UNA vez en la salida estándar. Guárdalo en Turistero → /admin/connections
// (se cifra en la base de datos). No lo pegues en Git, chats ni tickets.
import { diagnose, graph, redact } from "./meta-lib.mjs";

export async function exchange(env = process.env, argv = process.argv.slice(2), out = console.log, err = console.error) {
  const short = argv[0] ?? env.META_SHORT_TOKEN;
  if (!env.META_APP_ID || !env.META_APP_SECRET || !short) {
    err("Uso: META_APP_ID=... META_APP_SECRET=... node meta-app/scripts/long-lived-token.mjs <token-corto>");
    return 2;
  }
  const r = await graph("oauth/access_token", { grant_type: "fb_exchange_token", client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, fb_exchange_token: short });
  if (!r.ok) {
    const d = diagnose(r.json?.error, r.status);
    err(redact(`✗ No se pudo cambiar el token — ${d.status}: ${d.hint}`, [env.META_APP_SECRET, short]));
    return 1;
  }
  const days = r.json.expires_in ? Math.round(r.json.expires_in / 86_400) : null;
  err(`✓ Token de larga duración${days ? ` (~${days} días)` : ""}. Guárdalo en /admin/connections; no lo compartas.`);
  out(r.json.access_token);
  return 0;
}

if (process.argv[1]?.endsWith("long-lived-token.mjs")) exchange().then((c) => process.exit(c));
