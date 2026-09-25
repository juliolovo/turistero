import type { SourceContent } from "@turistero/event-parser";
import { FetchError } from "../safe-fetch";
import { extractSocialLinks, normalizeProfileUrl } from "../social-links";
import type { AdapterResult, CheckStatus, DiscoverySource, FetchOptions, SourceAdapter } from "../types";

/**
 * Adaptadores de Meta: SOLO API oficial (Graph API) y solo con credenciales que el usuario autorizó.
 * No se hace scraping de facebook.com / instagram.com: sin credenciales el resultado es AUTH_REQUIRED.
 *
 * Requisitos de Meta (verificar en la documentación vigente antes de producción):
 *  - Facebook: leer publicaciones de Páginas de terceros requiere la función "Page Public Content Access" (App Review).
 *  - Instagram: Business Discovery lee media de otras cuentas PROFESIONALES (Business/Creator) usando el
 *    IG User ID de una cuenta profesional propia conectada mediante Facebook Login.
 * Los códigos de error de Graph API se traducen a estados de auditoría en `mapGraphError` (mejor esfuerzo).
 */
const DEFAULT_VERSION = "v21.0";
const RECENT_DAYS = 45;

interface GraphError { message?: string; type?: string; code?: number; error_subcode?: number }

export function mapGraphError(httpStatus: number, err: GraphError | undefined): { status: CheckStatus; message: string } {
  const code = err?.code;
  if (code === 190 || code === 102 || code === 463 || code === 467) return { status: "AUTH_REQUIRED", message: "El token de Meta es inválido o venció; hay que volver a conectar la cuenta." };
  if (code === 4 || code === 17 || code === 32 || code === 341 || code === 613 || httpStatus === 429) return { status: "RATE_LIMITED", message: "Meta limitó las peticiones; se reintentará más tarde." };
  if (code === 10 || code === 200 || code === 210 || code === 283 || code === 3) return { status: "ACCESS_RESTRICTED", message: "La app no tiene el permiso o la función necesaria (p. ej. Page Public Content Access) para leer este contenido." };
  if (code === 100 || code === 110) return { status: "ACCESS_RESTRICTED", message: "Meta no permite leer este perfil: no existe, es privado o (Instagram) no es una cuenta profesional." };
  if (httpStatus === 404) return { status: "NOT_FOUND", message: "Perfil no encontrado." };
  return { status: "ERROR", message: `Error de Graph API${code ? ` (${code})` : ""}: ${err?.message ?? httpStatus}`.slice(0, 200) };
}

async function graph<T>(o: FetchOptions, path: string, params: Record<string, string>, token: string): Promise<{ ok: true; data: T } | { ok: false; status: CheckStatus; message: string }> {
  const url = new URL(`https://graph.facebook.com/${o.graphVersion ?? DEFAULT_VERSION}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token); // nunca se registra la URL
  try {
    const r = await o.fetcher.get(url.toString(), { accept: "application/json", ignoreRobots: true, raw: true });
    const json = JSON.parse(r.body) as { error?: GraphError } & T;
    if (r.status >= 400 || json.error) return { ok: false, ...mapGraphError(r.status, json.error) };
    return { ok: true, data: json };
  } catch (e) {
    if (e instanceof FetchError) return { ok: false, status: e.status, message: e.message };
    return { ok: false, status: "ERROR", message: "Respuesta inválida de Graph API" };
  }
}

const isRecent = (iso: string | undefined, now: Date) => !iso || now.getTime() - new Date(iso).getTime() <= RECENT_DAYS * 86_400_000;

function finish(source: DiscoverySource, contents: SourceContent[], reviewed: number, dropped: number): AdapterResult {
  const links = contents.flatMap((c) => extractSocialLinks({ text: c.text }));
  if (!reviewed) return { status: "NO_RECENT_CONTENT", message: "La cuenta no tiene publicaciones.", contents, postsReviewed: 0 };
  if (!contents.length) return { status: "NO_RECENT_CONTENT", message: `${reviewed} publicaciones, ninguna reciente (últimos ${RECENT_DAYS} días).`, contents, postsReviewed: reviewed };
  return { status: "SUCCESS", message: `${reviewed} publicaciones revisadas (${dropped} antiguas descartadas)`, contents, postsReviewed: reviewed, discoveredLinks: links };
}

export class FacebookAdapter implements SourceAdapter {
  readonly id = "facebook";
  canHandle = (s: DiscoverySource) => !!s.urls.facebook;

  async fetchRecentContent(source: DiscoverySource, o: FetchOptions): Promise<AdapterResult> {
    const cred = o.credentials?.facebook;
    if (!cred) {
      return { status: "AUTH_REQUIRED", message: "Facebook requiere una app de Meta autorizada (API oficial). Sin credenciales no se consulta la página.", contents: [], postsReviewed: 0 };
    }
    const n = normalizeProfileUrl(source.urls.facebook!);
    if (!n || n.platform !== "facebook") return { status: "NOT_FOUND", message: "URL de Facebook no reconocida.", contents: [], postsReviewed: 0 };
    const pageId = n.key.startsWith("id:") ? n.key.slice(3) : n.key;

    const res = await graph<{ data?: { message?: string; story?: string; permalink_url?: string; created_time?: string; full_picture?: string }[] }>(
      o, `${encodeURIComponent(pageId)}/posts`, { fields: "message,permalink_url,created_time,full_picture", limit: String(o.maxItems) }, cred.token,
    );
    if (!res.ok) return { status: res.status, message: res.message, contents: [], postsReviewed: 0 };
    const posts = res.data.data ?? [];
    const recent = posts.filter((p) => p.message && isRecent(p.created_time, o.now));
    const contents = recent.map<SourceContent>((p) => ({
      sourceId: source.id,
      profileUrl: source.urls.facebook,
      originalPostUrl: p.permalink_url ?? null, // enlace real a la publicación
      text: p.message!,
      publishedAt: p.created_time,
      imageUrl: p.full_picture,
    }));
    return finish(source, contents, posts.length, posts.length - recent.length);
  }
}

export class InstagramAdapter implements SourceAdapter {
  readonly id = "instagram";
  canHandle = (s: DiscoverySource) => !!s.urls.instagram;

  async fetchRecentContent(source: DiscoverySource, o: FetchOptions): Promise<AdapterResult> {
    const cred = o.credentials?.instagram;
    if (!cred) {
      return { status: "AUTH_REQUIRED", message: "Instagram requiere conectar una cuenta profesional (Business/Creator) vía Meta. Sin credenciales no se consulta el perfil.", contents: [], postsReviewed: 0 };
    }
    const n = normalizeProfileUrl(source.urls.instagram!);
    if (!n || n.platform !== "instagram") return { status: "NOT_FOUND", message: "URL de Instagram no reconocida.", contents: [], postsReviewed: 0 };

    const fields = `business_discovery.username(${n.key}){username,media.limit(${o.maxItems}){caption,permalink,timestamp,media_type,media_url,thumbnail_url}}`;
    const res = await graph<{ business_discovery?: { media?: { data?: { caption?: string; permalink?: string; timestamp?: string; media_type?: string; media_url?: string; thumbnail_url?: string }[] } } }>(
      o, encodeURIComponent(cred.externalId), { fields }, cred.token,
    );
    if (!res.ok) return { status: res.status, message: res.message, contents: [], postsReviewed: 0 };
    const media = res.data.business_discovery?.media?.data ?? [];
    const recent = media.filter((m) => m.caption && isRecent(m.timestamp, o.now));
    const contents = recent.map<SourceContent>((m) => ({
      sourceId: source.id,
      profileUrl: source.urls.instagram,
      originalPostUrl: m.permalink ?? null,
      text: m.caption!,
      publishedAt: m.timestamp,
      imageUrl: m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url,
    }));
    return finish(source, contents, media.length, media.length - recent.length);
  }
}
