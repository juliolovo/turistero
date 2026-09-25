// Pruebas del detector de secretos (node --test). Los "secretos" de prueba se construyen en tiempo de ejecución
// para que este archivo no dispare el propio detector.
import assert from "node:assert/strict";
import { test } from "node:test";
import { isForbiddenPath, scanFiles, scanText } from "./check-secrets.mjs";

const rules = (path, text) => scanText(path, text).map((f) => f.rule);
const fake = {
  aws: "AKIA" + "ABCDEFGHIJKLMNOP",
  gh: "ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8",
  google: "AIza" + "SyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q",
  gocspx: "GOCSPX-" + "a1B2c3D4e5F6g7H8i9J0k1L2",
  stripe: "sk_live_" + "a1B2c3D4e5F6g7H8i9J0k1L2",
  meta: "EAA" + "B".repeat(10) + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8s9T0",
  jwt: "eyJ" + "hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" + ".eyJ" + "zdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ" + ".SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
  pk: "-----BEGIN " + "PRIVATE KEY-----",
  neon: "napi_" + "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
};

test("detecta tokens de alta señal", () => {
  assert.deepEqual(rules("src/x.ts", `const k = "${fake.aws}"`), ["AWS access key"]);
  assert.deepEqual(rules("src/x.ts", `x = ${fake.gh}`), ["token de GitHub"]);
  assert.deepEqual(rules("src/x.ts", `key: '${fake.google}'`), ["API key de Google"]);
  assert.deepEqual(rules("src/x.ts", fake.gocspx), ["client secret de Google"]);
  assert.deepEqual(rules("src/x.ts", fake.stripe), ["clave de Stripe"]);
  assert.deepEqual(rules("src/x.ts", fake.meta), ["token de acceso de Meta"]);
  assert.deepEqual(rules("src/x.ts", fake.neon), ["token de Neon"]);
  assert.match(rules("src/x.ts", `Bearer ${fake.jwt}`)[0], /JWT/);
  assert.deepEqual(rules("src/k.ts", fake.pk), ["clave privada"]);
});

test("detecta URLs de base de datos con contraseña real, no las de ejemplo", () => {
  assert.deepEqual(rules("src/db.ts", "postgres://admin:Sup3rS3creta123@ep-cool.neon.tech/db"), ["URL de base de datos con contraseña"]);
  assert.deepEqual(rules(".env.example", "DATABASE_URL=postgres://user:pass@host/db"), []);
  assert.deepEqual(rules("README.md", "postgres://usuario:TU-CONTRASENA@host/db"), []);
});

test("detecta asignaciones de secretos en código y .env, pero no referencias ni ejemplos", () => {
  assert.equal(rules("src/config.ts", 'const API_SECRET = "9fA3kQ7xLmP2vB8nR4tY6wZ1"').length, 1);
  assert.equal(rules("apps/web/.env.txt", "AUTH_SECRET=Zk3mQ8vT1xN6pL9wR2yB5cD7").length, 1);
  assert.deepEqual(rules("src/config.ts", "const secret = process.env.API_SECRET_VALUE_LONG"), []);
  assert.deepEqual(rules("src/db.ts", "const tokenEnc = encryptToken(c.token)"), []);
  assert.deepEqual(rules(".env.example", "AUTH_SECRET=tu-secreto-largo-y-aleatorio-aqui"), []);
  assert.deepEqual(rules("docs/x.md", "AUTH_SECRET=<genera-uno-con-openssl>"), []);
  assert.deepEqual(rules("docs/x.md", "TOKEN_ENCRYPTION_KEY=xxxxxxxxxxxxxxxxxxxxxxxx"), []);
});

test("los archivos de prueba pueden tener constantes falsas en asignaciones (pero no tokens reales)", () => {
  assert.deepEqual(rules("apps/api/src/a.test.ts", 'const SECRET = "test-secret-test-secret-test-secret-0123"'), []);
  assert.equal(rules("apps/api/src/a.test.ts", `const t = "${fake.gh}"`).length, 1);
});

test("correos: solo dominios de ejemplo", () => {
  assert.deepEqual(rules("docs/a.md", "escribe a contacto@example.com"), []);
  assert.deepEqual(rules("docs/a.md", "admin@dev.local"), []);
  assert.deepEqual(rules("docs/a.md", "133794525+alguien@users.noreply.github.com"), []);
  assert.deepEqual(rules("docs/a.md", "persona" + "@" + "gmail.com"), ["correo real (dato personal)"]);
});

test("la marca secret-scan:allow exime una línea", () => {
  assert.deepEqual(rules("src/x.ts", `const k = "${fake.aws}" // secret-scan:allow ejemplo de la documentación`), []);
});

test("nombres de archivo prohibidos", () => {
  for (const p of [".env", ".env.local", "apps/api/.env.production", "clave.pem", "AuthKey_ABC.p8", "id_rsa", "service-account.json", "client_secret_123.json", ".pglite/base", "secrets.json"]) {
    assert.ok(isForbiddenPath(p), p);
  }
  for (const p of [".env.example", "apps/web/src/app/page.tsx", "docs/AUTH.md", "packages/db/drizzle/0001.sql"]) {
    assert.equal(isForbiddenPath(p), null, p);
  }
});

test("scanFiles combina rutas prohibidas y contenido, y enmascara el secreto", () => {
  const files = { ".env.local": "A=1", "src/a.ts": `const t = "${fake.gh}"`, "src/ok.ts": "export const x = 1" };
  const out = scanFiles(Object.keys(files), (f) => files[f]);
  assert.equal(out.length, 2);
  assert.match(out[0].rule, /archivo prohibido/);
  assert.match(out[1].snippet, /^ghp_…\(\d+ caracteres\)$/);
  assert.ok(!JSON.stringify(out).includes(fake.gh), "nunca se imprime el secreto completo");
});

test("ignora lockfiles y binarios", () => {
  assert.deepEqual(rules("package-lock.json", `"integrity": "sha512-${"a1B2".repeat(30)}"`), []);
  assert.deepEqual(rules("logo.png", fake.aws), []);
});
