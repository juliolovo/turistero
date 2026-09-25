#!/usr/bin/env node
// Genera el "client secret" de Sign in with Apple: un JWT firmado (ES256) con tu clave privada .p8.
// Apple exige que caduque como máximo a los 6 meses: vuelve a generarlo antes (pon un recordatorio).
//
//   APPLE_TEAM_ID=ABCDE12345 APPLE_KEY_ID=XYZ987 APPLE_SERVICE_ID=com.tu.app.web \
//   node scripts/apple-client-secret.mjs ruta/a/AuthKey_XYZ987.p8
//
// Imprime el JWT (úsalo como AUTH_APPLE_SECRET; AUTH_APPLE_ID = tu Services ID). No subas el .p8 ni el JWT a Git.
import { readFileSync } from "node:fs";
import { SignJWT, importPKCS8 } from "jose";

const { APPLE_TEAM_ID: team, APPLE_KEY_ID: kid, APPLE_SERVICE_ID: sub } = process.env;
const keyPath = process.argv[2];
const months = Math.min(Number(process.env.APPLE_SECRET_MONTHS ?? 5), 6);

if (!team || !kid || !sub || !keyPath) {
  console.error("Uso: APPLE_TEAM_ID=... APPLE_KEY_ID=... APPLE_SERVICE_ID=... node scripts/apple-client-secret.mjs <AuthKey.p8>");
  process.exit(2);
}

const key = await importPKCS8(readFileSync(keyPath, "utf8"), "ES256");
const now = Math.floor(Date.now() / 1000);
const jwt = await new SignJWT({})
  .setProtectedHeader({ alg: "ES256", kid })
  .setIssuer(team)
  .setSubject(sub)
  .setAudience("https://appleid.apple.com")
  .setIssuedAt(now)
  .setExpirationTime(now + Math.round(months * 30 * 86400))
  .sign(key);

console.error(`✓ JWT generado; caduca en ~${months} meses. Guárdalo como AUTH_APPLE_SECRET.`);
console.log(jwt);
