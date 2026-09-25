import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { META_STATE_COOKIE, redirectUri, sameState, siteOrigin } from "@/lib/meta-oauth";
import { apiAs, apiConfigured } from "@/lib/session-api";

interface Result {
  facebook: { name: string | null } | null;
  instagram: { username: string }[];
  pages: { name: string }[];
  expiresAt: string | null;
  warnings: string[];
}

/** Paso 2: Meta vuelve aquí con `?code=…&state=…`. La API canjea el código (con el secreto de la app) y guarda los tokens cifrados. */
export async function GET(req: Request) {
  const origin = siteOrigin(req.url);
  const url = new URL(req.url);
  const done = (kind: "ok" | "error", msg: string) => {
    const res = NextResponse.redirect(`${origin}/admin/connections?${kind}=${encodeURIComponent(msg.slice(0, 600))}`);
    res.cookies.delete({ name: META_STATE_COOKIE, path: "/admin/connections/meta" }); // el state es de un solo uso
    return res;
  };

  const s = await auth();
  if (!s?.user?.id || s.user.role !== "ADMIN") return NextResponse.redirect(`${origin}/login?callbackUrl=/admin/connections`);

  // El usuario canceló o Meta devolvió un error
  const denied = url.searchParams.get("error");
  if (denied) return done("error", `Meta canceló la conexión: ${url.searchParams.get("error_description") ?? denied}`);

  const expected = (await cookies()).get(META_STATE_COOKIE)?.value;
  if (!sameState(expected, url.searchParams.get("state"))) return done("error", "La respuesta de Meta no coincide con tu solicitud (state inválido o vencido). Inténtalo de nuevo.");
  const code = url.searchParams.get("code");
  if (!code) return done("error", "Meta no devolvió un código de autorización.");
  if (!apiConfigured()) return done("error", "La API no está configurada (API_URL / API_JWT_SECRET).");

  const res = await apiAs(s.user.id, "/meta/connect", { method: "POST", body: JSON.stringify({ code, redirectUri: redirectUri(req.url) }) });
  const json = (await res.json().catch(() => ({}))) as Partial<Result> & { error?: { message?: string } };
  if (!res.ok) return done("error", json.error?.message ?? `No se pudo completar la conexión (${res.status}).`);

  const r = json as Result;
  const parts = [
    `Conectado${r.facebook?.name ? ` como ${r.facebook.name}` : ""}.`,
    r.instagram.length ? `Instagram: ${r.instagram.map((i) => "@" + i.username).join(", ")}.` : "Sin cuenta de Instagram profesional vinculada.",
    r.pages.length ? `Páginas: ${r.pages.map((p) => p.name).join(", ")}.` : "",
    r.expiresAt ? `El token vence el ${new Date(r.expiresAt).toLocaleDateString("es")}.` : "",
    ...r.warnings,
  ].filter(Boolean);
  return done(r.warnings.length ? "error" : "ok", parts.join(" "));
}
