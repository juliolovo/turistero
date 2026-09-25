import { auth } from "@/auth";
import { apiAs } from "@/lib/session-api";

/** Descarga el catálogo como sources.json (la API exige rol EDITOR o superior). */
export async function GET() {
  const uid = (await auth())?.user?.id;
  if (!uid) return new Response("No autenticado", { status: 401 });
  const res = await apiAs(uid, "/sources/export");
  if (!res.ok) return new Response("No autorizado o error de API", { status: res.status });
  return new Response(await res.text(), {
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": 'attachment; filename="sources.json"', "cache-control": "no-store" },
  });
}
