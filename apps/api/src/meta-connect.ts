import { mapGraphError } from "@turistero/discovery";
import { saveConnection, markConnectionError, connections, type Db } from "@turistero/db";
import { eq } from "drizzle-orm";
import { decryptToken } from "@turistero/db";
import { HttpError } from "./http";

/**
 * "Conectar con Meta": intercambia el `code` de OAuth por un token de larga duración (~60 días), detecta las Páginas que la
 * persona administra y su cuenta de Instagram profesional vinculada, y guarda las conexiones CIFRADAS.
 * Todo con la Graph API oficial. El secreto de la app vive solo en el servidor y el token nunca se devuelve.
 */
export interface MetaConnectDeps {
  db: Db;
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
}

export interface MetaConnectResult {
  facebook: { userId: string; name: string | null } | null;
  instagram: { id: string; username: string; page: string }[];
  pages: { id: string; name: string }[];
  scopes: string[];
  expiresAt: string | null;
  warnings: string[];
}

type GraphJson = { error?: { code?: number; message?: string }; [k: string]: unknown };

async function graph(d: MetaConnectDeps, path: string, params: Record<string, string>): Promise<GraphJson> {
  const env = d.env ?? process.env;
  const base = (env.META_GRAPH_BASE ?? "https://graph.facebook.com").replace(/\/$/, "");
  const url = new URL(`${base}/${env.META_GRAPH_VERSION ?? "v21.0"}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await (d.fetchImpl ?? fetch)(url, { headers: { accept: "application/json" } });
  const json = (await res.json().catch(() => ({}))) as GraphJson;
  if (!res.ok || json.error) {
    const m = mapGraphError(res.status, json.error);
    throw new HttpError(m.status === "AUTH_REQUIRED" ? 400 : 502, m.status, m.message); // nunca incluye la URL (lleva secretos)
  }
  return json;
}

export const REQUIRED_SCOPES = ["pages_show_list", "instagram_basic"];

export function metaConfigured(env: Record<string, string | undefined> = process.env) {
  return !!env.META_APP_ID && !!env.META_APP_SECRET && !!env.TOKEN_ENCRYPTION_KEY;
}

export async function connectMeta(d: MetaConnectDeps, i: { userId: string; code: string; redirectUri: string }): Promise<MetaConnectResult> {
  const env = d.env ?? process.env;
  if (!metaConfigured(env)) throw new HttpError(503, "NOT_CONFIGURED", "Falta META_APP_ID, META_APP_SECRET o TOKEN_ENCRYPTION_KEY en la API.");
  const app = { client_id: env.META_APP_ID!, client_secret: env.META_APP_SECRET! };

  // 1) code -> token de corta duración
  const short = await graph(d, "oauth/access_token", { ...app, redirect_uri: i.redirectUri, code: i.code });
  if (typeof short.access_token !== "string") throw new HttpError(502, "ERROR", "Meta no devolvió un token.");
  // 2) corta -> larga duración (~60 días)
  const long = await graph(d, "oauth/access_token", { grant_type: "fb_exchange_token", ...app, fb_exchange_token: short.access_token });
  const token = typeof long.access_token === "string" ? long.access_token : short.access_token;
  const expiresIn = typeof long.expires_in === "number" ? long.expires_in : null;

  // 3) ¿qué permisos se concedieron y quién es?
  const dbg = (await graph(d, "debug_token", { input_token: token, access_token: `${app.client_id}|${app.client_secret}` })).data as
    | { scopes?: string[]; user_id?: string; expires_at?: number; is_valid?: boolean }
    | undefined;
  const scopes = dbg?.scopes ?? [];
  const warnings: string[] = [];
  for (const s of REQUIRED_SCOPES) if (!scopes.includes(s)) warnings.push(`Falta el permiso ${s}: no se podrá leer con esta conexión.`);
  const expiresAt = dbg?.expires_at ? new Date(dbg.expires_at * 1000) : expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;
  const me = (await graph(d, "me", { fields: "id,name", access_token: token })) as { id?: string; name?: string };
  if (!me.id) throw new HttpError(502, "ERROR", "Meta no devolvió el usuario.");

  // 4) Páginas administradas y su Instagram profesional vinculado
  let pages: { id: string; name: string; instagram_business_account?: { id: string; username?: string } }[] = [];
  if (scopes.includes("pages_show_list") || scopes.length === 0) {
    const acc = await graph(d, "me/accounts", { fields: "id,name,instagram_business_account{id,username}", access_token: token }).catch((e) => {
      warnings.push(`No se pudieron listar tus Páginas: ${(e as Error).message}`);
      return { data: [] } as GraphJson;
    });
    pages = ((acc.data as typeof pages) ?? []).filter((p) => p?.id);
  }

  // 5) guardar (cifrado). Reconectar actualiza, no duplica.
  const common = { userId: i.userId, token, scope: scopes.join(",") || undefined, expiresAt };
  await saveConnection(d.db, { ...common, provider: "facebook", externalId: me.id, label: `Facebook · ${me.name ?? me.id}` });
  const instagram: MetaConnectResult["instagram"] = [];
  for (const p of pages) {
    const ig = p.instagram_business_account;
    if (!ig?.id) continue;
    await saveConnection(d.db, { ...common, provider: "instagram", externalId: ig.id, label: `@${ig.username ?? ig.id} (vía ${p.name})` });
    instagram.push({ id: ig.id, username: ig.username ?? ig.id, page: p.name });
  }
  if (!pages.length) warnings.push("No administras ninguna Página. Para leer Instagram necesitas una cuenta profesional vinculada a una Página.");
  else if (!instagram.length) warnings.push("Ninguna de tus Páginas tiene una cuenta de Instagram profesional vinculada: no se podrá usar Business Discovery.");

  return {
    facebook: { userId: me.id, name: me.name ?? null },
    instagram,
    pages: pages.map((p) => ({ id: p.id, name: p.name })),
    scopes,
    expiresAt: expiresAt?.toISOString() ?? null,
    warnings,
  };
}

/** Prueba una conexión guardada (debug_token): válida, permisos, vencimiento. Actualiza `lastError`. */
export async function testConnection(d: MetaConnectDeps, id: string): Promise<{ valid: boolean; scopes: string[]; expiresAt: string | null; message: string }> {
  const env = d.env ?? process.env;
  const [row] = await d.db.select().from(connections).where(eq(connections.id, id));
  if (!row) throw new HttpError(404, "NOT_FOUND", "Conexión no encontrada");
  if (!metaConfigured(env)) throw new HttpError(503, "NOT_CONFIGURED", "Falta META_APP_ID / META_APP_SECRET / TOKEN_ENCRYPTION_KEY.");
  let token: string;
  try {
    token = decryptToken(row.tokenEnc);
  } catch {
    await markConnectionError(d.db, id, "No se pudo descifrar el token (¿cambió TOKEN_ENCRYPTION_KEY?)");
    return { valid: false, scopes: [], expiresAt: null, message: "No se pudo descifrar el token guardado." };
  }
  try {
    const dbg = (await graph(d, "debug_token", { input_token: token, access_token: `${env.META_APP_ID}|${env.META_APP_SECRET}` })).data as { is_valid?: boolean; scopes?: string[]; expires_at?: number } | undefined;
    const valid = !!dbg?.is_valid;
    const expiresAt = dbg?.expires_at ? new Date(dbg.expires_at * 1000).toISOString() : null;
    await markConnectionError(d.db, id, valid ? null : "El token ya no es válido: vuelve a conectar Meta.");
    return { valid, scopes: dbg?.scopes ?? [], expiresAt, message: valid ? "El token es válido." : "El token ya no es válido: vuelve a conectar Meta." };
  } catch (e) {
    const msg = (e as Error).message;
    await markConnectionError(d.db, id, msg);
    return { valid: false, scopes: [], expiresAt: null, message: msg };
  }
}
