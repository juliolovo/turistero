#!/usr/bin/env node
// Detector de secretos e información sensible SIN dependencias. Se ejecuta:
//   - antes de cada commit (hook .githooks/pre-commit)  ->  --staged
//   - antes de cada push   (hook .githooks/pre-push)    ->  --all
//   - en CI (.github/workflows/secret-scan.yml)         ->  --all --history
//
//   node scripts/check-secrets.mjs --staged | --all | --history | --file <ruta>
//
// Nunca imprime el secreto completo (solo un fragmento enmascarado). Si es un falso positivo real, añade el comentario
// `secret-scan:allow` en esa misma línea (o el archivo a scripts/secret-scan.config.json → allowPaths) y explica por qué.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
export const CONFIG = existsSync(path.join(here, "secret-scan.config.json")) ? JSON.parse(readFileSync(path.join(here, "secret-scan.config.json"), "utf8")) : {};

/* ---------- rutas que nunca deben versionarse ---------- */
export const FORBIDDEN_PATHS = [
  [/(^|\/)\.env(?!\.example$)(\.[^/]*)?$/i, "archivo .env (solo se versiona .env.example)"],
  [/\.(pem|p8|p12|pfx|jks|keystore|ppk)$/i, "clave o certificado privado"],
  [/(^|\/)(id_rsa|id_ed25519|id_ecdsa)(\.pub)?$/i, "clave SSH"],
  [/(^|\/)(service-account|credentials|client_secret)[^/]*\.json$/i, "credenciales JSON de un proveedor"],
  [/(^|\/)\.(pglite|vercel|netrc)(\/|$)/i, "datos/credenciales locales"],
  [/\.(sqlite|sqlite3|db)$/i, "base de datos local"],
  [/(^|\/)(tokens?|secrets?)\.(json|ya?ml|txt)$/i, "archivo de tokens/secretos"],
];

/* ---------- patrones de alta señal (siempre bloquean) ---------- */
export const TOKEN_RULES = [
  ["clave privada", /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/],
  ["AWS access key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["token de GitHub", /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ["token de Slack", /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ["API key de Google", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["client secret de Google", /\bGOCSPX-[A-Za-z0-9_-]{20,}/],
  ["clave de Stripe", /\b[sr]k_(?:live|test)_[A-Za-z0-9]{20,}/],
  ["token de acceso de Meta", /\bEAA[A-Za-z0-9]{40,}\b/],
  ["token de Neon", /\bnapi_[a-z0-9]{30,}/],
  ["JWT (posible service key de Supabase u otro token)", /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/],
  ["token de npm", /\bnpm_[A-Za-z0-9]{30,}\b/],
];

const PLACEHOLDER = /^(?:x+|\*+|\.{3}|<[^>]*>|\$\{?[A-Z_]+\}?|tu[-_ ]|your|changeme|change-me|example|ejemplo|pass(?:word)?$|user$|host$|secret$|token$|secreto|contrase|process\.env|null|undefined|test|dummy|fake|placeholder|abc)/i;
const looksPlaceholder = (v) => PLACEHOLDER.test(v) || /^(.)\1{5,}$/.test(v) || /(?:^|[-_])(?:ejemplo|example|prueba|test|demo|fake|dummy)(?:$|[-_])/i.test(v);

/* Asignaciones tipo NOMBRE_SECRETO=valor largo */
const ASSIGN = /\b([A-Za-z0-9_.-]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API[_-]?KEY|PRIVATE[_-]?KEY|ENCRYPTION[_-]?KEY|CLIENT[_-]?SECRET)[A-Za-z0-9_.-]*)\s*["']?\s*[:=]\s*["'`]?([^\s"'`#,;)}\]]{20,})/i;
/* URLs de base de datos con contraseña */
const DB_URL = /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/([^\s:@/]+):([^\s@/]+)@([^\s/]+)/i;
/* Correos: solo se permiten dominios de ejemplo (evita subir datos personales) */
const EMAIL = /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})\b/g;
const ALLOWED_EMAIL_DOMAINS = new Set(["example.com", "example.org", "example.net", "ejemplo.com", "dev.local", "users.noreply.github.com", "noreply.github.com", "anthropic.com", "turistero.example", "ci.example", ...(CONFIG.allowedEmailDomains ?? [])]);

const mask = (s) => (s.length <= 8 ? "****" : `${s.slice(0, 4)}…(${s.length} caracteres)`);
const isBinaryPath = (p) => /\.(png|jpe?g|gif|webp|ico|svg|woff2?|ttf|otf|pdf|zip|gz|mp4|mov)$/i.test(p);
const SKIP_CONTENT = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|drizzle\/meta\/[^/]+\.json)$/;

export function isForbiddenPath(p) {
  const norm = p.replace(/\\/g, "/");
  for (const [re, why] of FORBIDDEN_PATHS) if (re.test(norm)) return why;
  return null;
}

const allowedPath = (p) => (CONFIG.allowPaths ?? []).some((g) => new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*") + "$").test(p));

/** Escanea el texto de un archivo. Devuelve [{ line, rule, snippet }]. */
export function scanText(filePath, text) {
  const findings = [];
  const norm = filePath.replace(/\\/g, "/");
  if (SKIP_CONTENT.test(norm) || isBinaryPath(norm)) return findings;
  const isTestLike = /(^|\/)(e2e\/|tests?\/|__tests__\/|[^/]*\.test\.[cm]?[jt]sx?$|[^/]*\.spec\.[cm]?[jt]sx?$|fixtures\/)/.test(norm);
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    if (raw.includes("secret-scan:allow")) return;
    if (raw.length > 4000) return; // líneas minificadas
    const add = (rule, secret) => findings.push({ line: i + 1, rule, snippet: mask(secret) });

    for (const [name, re] of TOKEN_RULES) {
      const m = re.exec(raw);
      if (m) add(name, m[0]);
    }
    const db = DB_URL.exec(raw);
    if (db && !looksPlaceholder(db[2]) && !looksPlaceholder(db[1] + ":" + db[2])) add("URL de base de datos con contraseña", db[2]);

    const a = ASSIGN.exec(raw);
    if (a) {
      const [, name, value] = a;
      // valores de ejemplo, referencias a variables y constantes de tests no son secretos
      if (!looksPlaceholder(value) && !/[()]/.test(value) && !/^(?:process\.|import\.meta|env\.|\$|`|<)/i.test(value) && !isTestLike && !/\.example$/.test(norm)) {
        const entropy = new Set(value).size;
        if (entropy >= 10) add(`asignación a ${name}`, value);
      }
    }
    // las URLs con usuario:contraseña@host ya se evaluaron arriba; no son correos
    for (const m of raw.replace(new RegExp(DB_URL.source, "gi"), " ").matchAll(EMAIL)) {
      const domain = m[1].toLowerCase();
      if (!ALLOWED_EMAIL_DOMAINS.has(domain) && !domain.endsWith(".example") && !domain.endsWith(".local")) add("correo real (dato personal)", m[0]);
    }
  });
  return findings;
}

/* ---------- git ---------- */
const git = (args, opts = {}) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"], ...opts });

export function scanFiles(files, read) {
  const out = [];
  for (const f of files) {
    if (allowedPath(f)) continue;
    const why = isForbiddenPath(f);
    if (why) {
      out.push({ file: f, line: 0, rule: `archivo prohibido: ${why}`, snippet: "" });
      continue;
    }
    let text;
    try {
      text = read(f);
    } catch {
      continue;
    }
    if (text == null || text.includes("\u0000")) continue;
    for (const x of scanText(f, text)) out.push({ file: f, ...x });
  }
  return out;
}

export function scanStaged() {
  const files = git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]).split("\0").filter(Boolean);
  return scanFiles(files, (f) => git(["show", `:${f}`]));
}
export function scanTracked() {
  const files = git(["ls-files", "-z"]).split("\0").filter(Boolean);
  return scanFiles(files, (f) => readFileSync(f, "utf8"));
}
/** Revisa las líneas AÑADIDAS de todo el historial (un secreto borrado después sigue en el historial). */
export function scanHistory() {
  const log = git(["log", "--all", "--no-color", "-p", "--format=commit %H", "--no-ext-diff"]);
  const out = [];
  let commit = "", file = "";
  const buf = new Map(); // file@commit -> líneas añadidas
  for (const line of log.split("\n")) {
    if (line.startsWith("commit ")) commit = line.slice(7, 15);
    else if (line.startsWith("+++ b/")) file = line.slice(6);
    else if (line.startsWith("+++ ")) file = "";
    else if (file && line.startsWith("+") && !line.startsWith("+++")) {
      const k = `${commit}\0${file}`;
      buf.set(k, (buf.get(k) ?? []).concat(line.slice(1)));
    }
  }
  for (const [k, added] of buf) {
    const [c, f] = k.split("\0");
    if (allowedPath(f)) continue;
    const why = isForbiddenPath(f);
    if (why) out.push({ file: `${f} (commit ${c})`, line: 0, rule: `archivo prohibido en el historial: ${why}`, snippet: "" });
    else {
      for (const x of scanText(f, added.join("\n"))) {
        // Falsos positivos históricos ya revisados (un commit no se edita sin reescribir el historial): ver secret-scan.config.json
        const known = (CONFIG.historyAllow ?? []).some((a) => c.startsWith(a.commit) && a.file === f && x.rule.startsWith(a.rule));
        if (!known) out.push({ file: `${f} (commit ${c})`, ...x });
      }
    }
  }
  return out;
}

export function report(findings, log = console.error) {
  if (!findings.length) return 0;
  log(`\n✗ Se encontraron ${findings.length} posible(s) secreto(s) o dato(s) sensible(s):\n`);
  for (const f of findings) log(`  ${f.file}${f.line ? `:${f.line}` : ""}  —  ${f.rule}${f.snippet ? `  [${f.snippet}]` : ""}`);
  log(`\nQué hacer:\n  1. Quita el valor del código y guárdalo en .env.local (ignorado por Git) o en las variables de tu proveedor.\n  2. Si ya se subió a un remoto, considéralo comprometido: ROTA la credencial (no basta con borrarla).\n  3. Si es un falso positivo, añade \`secret-scan:allow\` en esa línea (con una nota de por qué) o el archivo a scripts/secret-scan.config.json.\n`);
  return 1;
}

/* ---------- CLI ---------- */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = new Set(process.argv.slice(2));
  const run = () => {
    if (args.has("--file")) {
      const f = process.argv[process.argv.indexOf("--file") + 1];
      return scanFiles([f], (x) => readFileSync(x, "utf8"));
    }
    const out = [];
    if (args.has("--staged")) out.push(...scanStaged());
    if (args.has("--all") || (!args.has("--staged") && !args.has("--history"))) out.push(...scanTracked());
    if (args.has("--history")) out.push(...scanHistory());
    return out;
  };
  const findings = run();
  const code = report(findings);
  if (!code) console.log("✓ Sin secretos ni datos sensibles detectados.");
  process.exit(code);
}
