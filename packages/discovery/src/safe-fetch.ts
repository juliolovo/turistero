import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { CheckStatus } from "./types";

export const USER_AGENT = "TuristeroBot/1.0 (+https://turistero.app/bot; agregador de eventos; respeta robots.txt)";

export class FetchError extends Error {
  constructor(
    public status: CheckStatus,
    message: string,
    public httpStatus?: number,
  ) {
    super(message);
  }
}

/** ¿Dirección privada, local o reservada? (bloquea SSRF hacia la red interna). */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === "::1" || x === "::") return true;
    if (x.startsWith("fe80") || x.startsWith("fc") || x.startsWith("fd")) return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x);
    return mapped ? isPrivateAddress(mapped[1]!) : false;
  }
  return true; // no es una IP válida
}

export interface FetchResult {
  url: string; // URL final tras redirecciones
  status: number;
  contentType: string;
  body: string;
}

export interface SafeFetcher {
  /** `raw`: devuelve también respuestas 4xx/5xx (p. ej. errores JSON de la Graph API) sin lanzar. */
  get(url: string, opts?: { accept?: string; ignoreRobots?: boolean; raw?: boolean }): Promise<FetchResult>;
}

export interface SafeFetcherOptions {
  fetchImpl?: typeof fetch;
  resolveHost?: (host: string) => Promise<string[]>;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** Segundos de espera mínima entre peticiones al mismo host (cortesía). */
  hostDelayMs?: number;
  respectRobots?: boolean;
}

const defaultResolve = async (host: string) => (await lookup(host, { all: true })).map((a) => a.address);

/**
 * Cliente HTTP prudente para páginas públicas:
 *  - solo http(s); bloquea hosts que resuelven a IPs privadas/locales (SSRF), también tras cada redirección;
 *  - timeout, límite de tamaño y de redirecciones; User-Agent identificable;
 *  - respeta robots.txt y espacia las peticiones por host;
 *  - nunca envía cookies ni credenciales, no intenta saltarse login/captcha.
 */
export function createSafeFetcher(o: SafeFetcherOptions = {}): SafeFetcher {
  const doFetch = o.fetchImpl ?? fetch;
  const resolveHost = o.resolveHost ?? defaultResolve;
  const timeoutMs = o.timeoutMs ?? 10_000;
  const maxBytes = o.maxBytes ?? 1_500_000;
  const maxRedirects = o.maxRedirects ?? 3;
  const hostDelay = o.hostDelayMs ?? 500;
  const respectRobots = o.respectRobots ?? true;
  const lastHit = new Map<string, number>();
  const robots = new Map<string, string[]>(); // host -> reglas Disallow para nuestro UA / *

  async function assertPublic(u: URL) {
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new FetchError("ERROR", `Protocolo no permitido: ${u.protocol}`);
    if (u.username || u.password) throw new FetchError("ERROR", "URL con credenciales no permitida");
    const host = u.hostname.replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
      throw new FetchError("ACCESS_RESTRICTED", "Host local no permitido");
    }
    const addrs = isIP(host) ? [host] : await resolveHost(host).catch(() => []);
    if (!addrs.length) throw new FetchError("NOT_FOUND", `No se pudo resolver ${host}`);
    if (addrs.some(isPrivateAddress)) throw new FetchError("ACCESS_RESTRICTED", "El host resuelve a una dirección privada");
  }

  async function politeWait(host: string) {
    const wait = (lastHit.get(host) ?? 0) + hostDelay - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastHit.set(host, Date.now());
  }

  async function robotsAllows(u: URL): Promise<boolean> {
    if (!respectRobots) return true;
    if (!robots.has(u.host)) {
      let rules: string[] = [];
      try {
        const r = await rawGet(new URL("/robots.txt", u), "text/plain", 0);
        if (r.status === 200) rules = parseRobots(r.body);
      } catch {
        /* sin robots.txt accesible: se permite */
      }
      robots.set(u.host, rules);
    }
    const path = u.pathname + u.search;
    return !robots.get(u.host)!.some((d) => d !== "" && path.startsWith(d));
  }

  async function rawGet(u: URL, accept: string, redirects: number): Promise<FetchResult> {
    await assertPublic(u);
    await politeWait(u.host);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await doFetch(u, { redirect: "manual", signal: ctrl.signal, headers: { "user-agent": USER_AGENT, accept, "accept-language": "es,en;q=0.7" } });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get("location");
        if (!loc) throw new FetchError("ERROR", "Redirección sin destino", res.status);
        if (redirects >= maxRedirects) throw new FetchError("ERROR", "Demasiadas redirecciones");
        const next = new URL(loc, u);
        // Una redirección a una pantalla de login significa contenido no público.
        if (/\/(login|signin|accounts\/login|checkpoint)\b/i.test(next.pathname)) throw new FetchError("AUTH_REQUIRED", "La página requiere iniciar sesión", res.status);
        return rawGet(next, accept, redirects + 1);
      }
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (res.body) {
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) {
            await reader.cancel();
            break; // se trunca: suficiente para metadatos
          }
          chunks.push(value);
        }
      }
      return { url: u.toString(), status: res.status, contentType: res.headers.get("content-type") ?? "", body: new TextDecoder().decode(Buffer.concat(chunks)) };
    } catch (e) {
      if (e instanceof FetchError) throw e;
      if ((e as Error).name === "AbortError") throw new FetchError("ERROR", `Tiempo de espera agotado (${timeoutMs} ms)`);
      throw new FetchError("ERROR", `Error de red: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async get(url, opts = {}) {
      let u: URL;
      try {
        u = new URL(url);
      } catch {
        throw new FetchError("ERROR", `URL inválida: ${url}`);
      }
      if (!opts.ignoreRobots && !(await robotsAllows(u))) throw new FetchError("ACCESS_RESTRICTED", "robots.txt no permite consultar esta ruta");
      const r = await rawGet(u, opts.accept ?? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5", 0);
      if (opts.raw) return r;
      if (r.status === 401) throw new FetchError("AUTH_REQUIRED", "La página requiere autenticación", 401);
      if (r.status === 403) throw new FetchError("ACCESS_RESTRICTED", "Acceso denegado por el sitio", 403);
      if (r.status === 404 || r.status === 410) throw new FetchError("NOT_FOUND", "Página no encontrada", r.status);
      if (r.status === 429) throw new FetchError("RATE_LIMITED", "El sitio limitó las peticiones", 429);
      if (r.status >= 400) throw new FetchError("ERROR", `El sitio respondió ${r.status}`, r.status);
      return r;
    },
  };
}

/** Reglas Disallow que aplican a nuestro UA; si hay un grupo específico se usa solo ese, si no el de `*`. */
export function parseRobots(txt: string): string[] {
  const star: string[] = [];
  const specific: string[] = [];
  let group: "star" | "specific" | null = null;
  let hasSpecific = false;
  let lastWasUa = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const k = m[1]!.toLowerCase(), v = m[2]!.trim();
    if (k === "user-agent") {
      const ua = v.toLowerCase();
      if (!lastWasUa) group = null; // empieza un grupo nuevo
      if (ua.includes("turisterobot")) { group = "specific"; hasSpecific = true; }
      else if (ua === "*" && group !== "specific") group = "star";
      lastWasUa = true;
    } else {
      lastWasUa = false;
      if (k === "disallow" && group) (group === "specific" ? specific : star).push(v);
    }
  }
  return hasSpecific ? specific : star;
}
