import { adminFetch, requireRole } from "@/lib/admin";
import { Flash, Th, btnDanger, btnPrimary, field, fmtDateTime } from "@/components/admin-ui";
import { createConnectionAction, deleteConnectionAction } from "../actions";

interface Conn { id: string; provider: string; externalId: string; label: string | null; expiresAt: string | null; lastError: string | null; createdAt: string }

export default async function Connections({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [u, sp] = [await requireRole("ADMIN"), await searchParams];
  const { items } = await adminFetch<{ items: Conn[] }>(u.id, "/connections");
  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="font-display text-3xl font-extrabold text-ink">Conexiones a Meta</h1>
      <div className="rounded-2xl bg-white p-5 text-sm space-y-2">
        <p>Turistero solo lee Facebook e Instagram mediante la <strong>API oficial de Meta</strong>, con un token que tú autorizas. No hay scraping.</p>
        <ul className="list-disc pl-5">
          <li><strong>Facebook</strong>: token con acceso de lectura a Páginas públicas (requiere la función <em>Page Public Content Access</em>, aprobada en App Review). <em>ID externo</em>: el de tu app o Página.</li>
          <li><strong>Instagram</strong>: <em>Business Discovery</em>; el ID externo es el <em>IG User ID</em> de una cuenta profesional (Business/Creator) propia y el token viene de Facebook Login. Solo puede leer cuentas profesionales públicas.</li>
        </ul>
        <p>Los tokens se guardan <strong>cifrados</strong> (AES-256-GCM) y nunca se muestran de nuevo.</p>
      </div>
      <Flash ok={sp.ok} error={sp.error} />
      <div className="overflow-x-auto rounded-2xl border border-cal-2 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-ink text-white"><tr><Th>Proveedor</Th><Th>ID externo</Th><Th>Etiqueta</Th><Th>Estado</Th><Th /></tr></thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className="border-b border-cal-2">
                <td className="px-3 py-2">{c.provider}</td><td className="px-3 py-2">{c.externalId}</td><td className="px-3 py-2">{c.label ?? "—"}</td>
                <td className="px-3 py-2">{c.lastError ? <span className="text-rose-deep">⚠ {c.lastError}</span> : `✅ desde ${fmtDateTime(c.createdAt)}`}</td>
                <td className="px-3 py-2"><form action={deleteConnectionAction}><input type="hidden" name="id" value={c.id} /><button className={btnDanger}>Eliminar</button></form></td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan={5} className="px-3 py-5 text-center">Sin conexiones: Facebook e Instagram quedan en “requiere autenticación”.</td></tr>}
          </tbody>
        </table>
      </div>
      <form action={createConnectionAction} className="grid gap-3 rounded-2xl bg-white p-5 sm:grid-cols-2">
        <h2 className="font-display text-xl font-bold sm:col-span-2">Agregar conexión</h2>
        <label className="text-sm font-semibold">Proveedor<select name="provider" className={field}><option value="facebook">facebook</option><option value="instagram">instagram</option></select></label>
        <label className="text-sm font-semibold">ID externo<input name="externalId" required className={field} /></label>
        <label className="text-sm font-semibold sm:col-span-2">Token de acceso<input name="token" type="password" autoComplete="off" required minLength={10} className={field} /></label>
        <label className="text-sm font-semibold sm:col-span-2">Etiqueta<input name="label" className={field} /></label>
        <div className="sm:col-span-2"><button className={btnPrimary}>Guardar (cifrado)</button></div>
      </form>
    </div>
  );
}
