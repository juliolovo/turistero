import { randomBytes, timingSafeEqual } from "node:crypto";

/** Utilidades del flujo "Conectar con Meta" (OAuth). El App ID es público; el secreto vive solo en la API. */
export const META_STATE_COOKIE = "meta_oauth_state";

// ⚠️ Confirma en el Dashboard de Meta los permisos vigentes (ver meta-app/README.md). Se pueden cambiar con META_SCOPES.
export const DEFAULT_META_SCOPES = "pages_show_list,instagram_basic,pages_read_engagement";

export const metaAppId = () => process.env.META_APP_ID ?? process.env.AUTH_FACEBOOK_ID;
export const metaVersion = () => process.env.META_GRAPH_VERSION ?? "v21.0";
export const metaScopes = () => process.env.META_SCOPES ?? DEFAULT_META_SCOPES;

export function siteOrigin(reqUrl: string): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? new URL(reqUrl).origin).replace(/\/$/, "");
}

/** Debe coincidir EXACTAMENTE con una de las "Valid OAuth Redirect URIs" de la app de Meta. */
export const redirectUri = (reqUrl: string) => `${siteOrigin(reqUrl)}/admin/connections/meta/callback`;

export const newState = () => randomBytes(24).toString("hex");

export function sameState(a: string | undefined, b: string | null): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function authorizeUrl(reqUrl: string, state: string): string {
  const u = new URL(`https://www.facebook.com/${metaVersion()}/dialog/oauth`);
  u.searchParams.set("client_id", metaAppId()!);
  u.searchParams.set("redirect_uri", redirectUri(reqUrl));
  u.searchParams.set("state", state);
  u.searchParams.set("scope", metaScopes());
  u.searchParams.set("response_type", "code");
  return u.toString();
}
