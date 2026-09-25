#!/usr/bin/env node
// Verifica tu Meta App y tu token SIN hacer scraping: solo llamadas oficiales a la Graph API.
//
//   META_APP_ID=... META_APP_SECRET=... META_ACCESS_TOKEN=... node meta-app/scripts/check-meta.mjs
//   ... --ig-user-id 1784... --discover ronkonrolas     # prueba Business Discovery sobre una cuenta profesional
//   ... --page nicaroad                                   # prueba leer publicaciones públicas de una Página
//
// Es de solo lectura, hace pocas llamadas y nunca imprime el token.
import { diagnose, graph, parseArgs, redact } from "./meta-lib.mjs";

export async function run(env = process.env, argv = process.argv.slice(2), out = console.log) {
  const args = parseArgs(argv);
  const appId = env.META_APP_ID, secret = env.META_APP_SECRET, token = env.META_ACCESS_TOKEN;
  const secrets = [secret, token];
  const say = (m) => out(redact(m, secrets));
  let failures = 0;

  if (!appId || !secret || !token) {
    say("Faltan variables: META_APP_ID, META_APP_SECRET y META_ACCESS_TOKEN.\nToken: Graph API Explorer -> tu app -> User Token -> permisos pages_show_list, instagram_basic.");
    return 2;
  }

  // 1) ¿El token es válido y qué permisos tiene?
  say("\n1) Token");
  const dbg = await graph("debug_token", { input_token: token, access_token: `${appId}|${secret}` });
  if (!dbg.ok) {
    const d = diagnose(dbg.json?.error, dbg.status);
    say(`   ✗ No se pudo inspeccionar el token — ${d.status}: ${d.hint}`);
    return 1;
  }
  const t = dbg.json.data ?? {};
  const exp = t.expires_at ? new Date(t.expires_at * 1000) : null;
  const days = exp ? Math.round((exp.getTime() - Date.now()) / 86_400_000) : null;
  say(`   ${t.is_valid ? "✓" : "✗"} válido: ${t.is_valid}  · tipo: ${t.type}  · app: ${t.application}`);
  say(`   vence: ${exp ? `${exp.toISOString().slice(0, 10)} (${days} días)` : "no vence / no informado"}${days !== null && days < 7 ? "  ⚠ renuévalo pronto (npm run meta:token)" : ""}`);
  say(`   permisos: ${(t.scopes ?? []).join(", ") || "(ninguno)"}`);
  if (!t.is_valid) return 1;
  const has = (s) => (t.scopes ?? []).includes(s);
  if (!has("pages_show_list")) say("   ⚠ falta pages_show_list: no podré listar tus Páginas ni tu cuenta de Instagram vinculada");
  if (!has("instagram_basic")) say("   ⚠ falta instagram_basic: necesario para Business Discovery");

  // 2) Páginas administradas y cuenta de Instagram vinculada (aquí sale tu IG User ID)
  say("\n2) Tus Páginas y cuenta de Instagram profesional vinculada");
  const accounts = await graph("me/accounts", { fields: "id,name,instagram_business_account{id,username}", access_token: token });
  if (!accounts.ok) {
    const d = diagnose(accounts.json?.error, accounts.status);
    say(`   ✗ ${d.status}: ${d.hint}`);
    failures++;
  } else if (!accounts.json.data?.length) {
    say("   (sin Páginas: crea una Página y vincula tu cuenta de Instagram profesional a ella)");
  } else {
    for (const p of accounts.json.data) {
      const ig = p.instagram_business_account;
      say(`   • ${p.name} (Página ${p.id}) → Instagram: ${ig ? `@${ig.username}  IG User ID = ${ig.id}` : "sin cuenta profesional vinculada"}`);
    }
  }

  // 3) Business Discovery (leer una cuenta profesional ajena) — opcional
  if (args["discover"] && args["ig-user-id"]) {
    say(`\n3) Business Discovery sobre @${args["discover"]}`);
    const name = String(args["discover"]).replace(/^@/, "").replace(/[^A-Za-z0-9._]/g, "");
    const r = await graph(String(args["ig-user-id"]), { fields: `business_discovery.username(${name}){username,followers_count,media_count,media.limit(3){permalink,timestamp,media_type}}`, access_token: token });
    if (!r.ok) {
      const d = diagnose(r.json?.error, r.status);
      say(`   ✗ ${d.status}: ${d.hint}`);
      failures++;
    } else {
      const bd = r.json.business_discovery;
      say(`   ✓ @${bd.username}: ${bd.media_count} publicaciones; últimas ${bd.media?.data?.length ?? 0}:`);
      for (const m of bd.media?.data ?? []) say(`     - ${m.timestamp?.slice(0, 10)} ${m.media_type} ${m.permalink}`);
    }
  } else if (args["discover"]) {
    say("\n3) Para probar Business Discovery añade también --ig-user-id <tu IG User ID> (sale en el paso 2).");
  }

  // 4) Leer publicaciones públicas de una Página (necesita Page Public Content Access fuera de modo desarrollo)
  if (args["page"]) {
    say(`\n4) Publicaciones públicas de la Página "${args["page"]}"`);
    const r = await graph(`${encodeURIComponent(String(args["page"]))}/posts`, { fields: "permalink_url,created_time", limit: 1, access_token: token });
    if (!r.ok) {
      const d = diagnose(r.json?.error, r.status);
      say(`   ✗ ${d.status}: ${d.hint}`);
      failures++;
    } else {
      say(`   ✓ lectura permitida (${r.json.data?.length ?? 0} publicación de muestra)`);
    }
  }

  say(failures ? `\nTerminó con ${failures} problema(s). Revisa las pistas de arriba y meta-app/README.md §9.` : "\nTodo lo consultado respondió bien.");
  return failures ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("check-meta.mjs")) {
  run().then((code) => process.exit(code));
}
