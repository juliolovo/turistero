import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { META_STATE_COOKIE, authorizeUrl, metaAppId, newState, siteOrigin } from "@/lib/meta-oauth";

/** Paso 1 de "Conectar con Meta": manda al administrador al diálogo de autorización de Facebook. */
export async function GET(req: Request) {
  const origin = siteOrigin(req.url);
  const back = (kind: "ok" | "error", msg: string) => NextResponse.redirect(`${origin}/admin/connections?${kind}=${encodeURIComponent(msg)}`);

  const s = await auth();
  if (!s?.user?.id) return NextResponse.redirect(`${origin}/login?callbackUrl=/admin/connections`);
  if (s.user.role !== "ADMIN") return NextResponse.redirect(`${origin}/?error=forbidden`);
  if (!metaAppId()) return back("error", "Falta META_APP_ID (o AUTH_FACEBOOK_ID) en la web. Ver meta-app/README.md.");

  // `state` anti-CSRF: aleatorio, en cookie httpOnly, se compara al volver.
  const state = newState();
  const res = NextResponse.redirect(authorizeUrl(req.url, state));
  res.cookies.set(META_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/admin/connections/meta",
    maxAge: 600,
  });
  return res;
}
