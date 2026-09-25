import { adminFetch, requireRole } from "@/lib/admin";
import { metaAppId, redirectUri } from "@/lib/meta-oauth";
import { Flash, Th, btn, btnDanger, btnPrimary, field, fmtDateTime } from "@/components/admin-ui";
import { FacebookIcon } from "@/components/brand-icons";
import { createConnectionAction, deleteConnectionAction, testConnectionAction } from "../actions";

interface Conn { id: string; provider: string; externalId: string; label: string | null; scope: string | null; expiresAt: string | null; lastError: string | null; createdAt: string }

const daysLeft = (iso: string | null) => (iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : null);

export default async function Connections({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [u, sp] = [await requireRole("ADMIN"), await searchParams];
  const [{ items }, status] = await Promise.all([
    adminFetch<{ items: Conn[] }>(u.id, "/connections"),
    adminFetch<{ configured: boolean; graphVersion: string }>(u.id, "/meta/status").catch(() => ({ configured: false, graphVersion: "?" })),
  ]);
  const webReady = !!metaAppId();
  const ready = webReady && status.configured;
  const callback = redirectUri(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");

  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="font-display text-3xl font-extrabold text-ink">Conexiones a Meta</h1>
      <Flash ok={sp.ok} error={sp.error} />

      <section className="space-y-3 rounded-2xl bg-white p-5" aria-labelledby="conectar">
        <h2 id="conectar" className="font-display text-xl font-bold text-ink">Conectar con Meta</h2>
        <p className="text-sm">Un clic: autorizas a Turistero en Facebook, y detectamos tu Página y tu cuenta de Instagram profesional. El token de larga duración (~60 días) se guarda <strong>cifrado</strong>. Turistero solo lee, por la API oficial, y como máximo una vez al día por fuente.</p>
        {ready ? (
          <a href="/admin/connections/meta/start" className={`${btnPrimary} inline-flex items-center gap-2`}>
            <span className="grid size-5 place-items-center rounded-full bg-white"><FacebookIcon className="size-4" /></span>
            {items.length ? "Reconectar con Meta" : "Conectar con Meta"}
          </a>
        ) : (
          <div className="space-y-1 rounded-lg bg-mango/30 px-4 py-3 text-sm">
            <p className="font-semibold">Aún no está lista la app de Meta.</p>
            <ul className="list-disc pl-5">
              {!webReady && <li>En la web falta <code>META_APP_ID</code> (o <code>AUTH_FACEBOOK_ID</code>).</li>}
              {!status.configured && <li>En la API faltan <code>META_APP_ID</code>, <code>META_APP_SECRET</code> o <code>TOKEN_ENCRYPTION_KEY</code>.</li>}
            </ul>
            <p>Crea la app siguiendo <code>meta-app/README.md</code> y pega esos valores en los <code>.env.local</code>.</p>
          </div>
        )}
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">Datos para configurar la app en developers.facebook.com</summary>
          <p className="mt-2">En <em>Facebook Login → Settings → Valid OAuth Redirect URIs</em> agrega exactamente:</p>
          <p><code className="break-all">{callback}</code></p>
          <p className="mt-1 text-xs text-cacao/70">Versión de Graph API: {status.graphVersion}. Permisos solicitados: <code>{process.env.META_SCOPES ?? "pages_show_list,instagram_basic,pages_read_engagement"}</code> (en modo desarrollo funcionan sin revisión con tu propia cuenta).</p>
        </details>
      </section>

      <div className="overflow-x-auto rounded-2xl border border-cal-2 bg-white">
        <table className="w-full text-sm">
          <caption className="sr-only">Conexiones guardadas</caption>
          <thead className="bg-ink text-white"><tr><Th>Proveedor</Th><Th>Cuenta</Th><Th>Vence</Th><Th>Estado</Th><Th /></tr></thead>
          <tbody>
            {items.map((c) => {
              const d = daysLeft(c.expiresAt);
              const soon = d !== null && d <= 7;
              return (
                <tr key={c.id} className="border-b border-cal-2 align-top">
                  <td className="px-3 py-2">{c.provider}</td>
                  <td className="px-3 py-2">{c.label ?? c.externalId}<span className="block text-xs text-cacao/60">ID {c.externalId}</span></td>
                  <td className={`px-3 py-2 ${soon ? "font-semibold text-rose-deep" : ""}`}>{c.expiresAt ? `${fmtDateTime(c.expiresAt)}${d !== null ? (d > 0 ? ` (${d} d)` : " (vencido)") : ""}` : "—"}</td>
                  <td className="px-3 py-2">{c.lastError ? <span className="text-rose-deep">⚠ {c.lastError}</span> : <>✅ activa</>}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      <form action={testConnectionAction}><input type="hidden" name="id" value={c.id} /><button className={btn}>Probar</button></form>
                      <form action={deleteConnectionAction}><input type="hidden" name="id" value={c.id} /><button className={btnDanger}>Eliminar</button></form>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!items.length && <tr><td colSpan={5} className="px-3 py-5 text-center">Sin conexiones: Facebook e Instagram quedan en “requiere autenticación”.</td></tr>}
          </tbody>
        </table>
      </div>

      <details className="rounded-2xl bg-white p-5">
        <summary className="cursor-pointer font-display text-xl font-bold">Avanzado: pegar un token a mano</summary>
        <form action={createConnectionAction} className="mt-4 grid gap-3 sm:grid-cols-2">
          <p className="text-sm sm:col-span-2">Solo si prefieres generar el token tú mismo (Graph API Explorer + <code>npm run meta:token</code>). El token se guarda cifrado y no se vuelve a mostrar.</p>
          <label className="text-sm font-semibold">Proveedor<select name="provider" className={field}><option value="facebook">facebook</option><option value="instagram">instagram</option></select></label>
          <label className="text-sm font-semibold">ID externo<input name="externalId" required className={field} /></label>
          <label className="text-sm font-semibold sm:col-span-2">Token de acceso<input name="token" type="password" autoComplete="off" required minLength={10} className={field} /></label>
          <label className="text-sm font-semibold sm:col-span-2">Etiqueta<input name="label" className={field} /></label>
          <div className="sm:col-span-2"><button className={btnPrimary}>Guardar (cifrado)</button></div>
        </form>
      </details>
    </div>
  );
}
