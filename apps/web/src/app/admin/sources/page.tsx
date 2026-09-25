import { CATEGORIES } from "@turistero/config";
import { adminFetch, requireRole, type StatusRow } from "@/lib/admin";
import { ExtLink, Flash, Link, StatusBadge, Th, btn, btnDanger, btnPrimary, field, relTime } from "@/components/admin-ui";
import { checkSourceAction, createSourceAction, deleteSourceAction, importSourcesAction, toggleSourceAction } from "../actions";

const TYPES = ["venue", "organizer", "tour-operator", "cultural", "mall", "institution", "media"];

export default async function SourcesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [u, sp] = [await requireRole("EDITOR"), await searchParams];
  const { items } = await adminFetch<{ items: StatusRow[] }>(u.id, "/sources/status");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-extrabold text-ink">Fuentes <span className="text-lg font-semibold text-cacao/60">({items.length})</span></h1>
        <div className="flex gap-2">
          <a href="/admin/sources/export" className={btn}>Exportar JSON</a>
        </div>
      </div>
      <Flash ok={sp.ok} error={sp.error} />

      <div className="overflow-x-auto rounded-2xl border border-cal-2 bg-white">
        <table className="w-full min-w-[60rem] text-sm">
          <caption className="sr-only">Fuentes del catálogo</caption>
          <thead className="bg-ink text-white"><tr><Th>Fuente</Th><Th>Ciudad</Th><Th>Tipo</Th><Th>Facebook</Th><Th>Instagram</Th><Th>Última revisión</Th><Th>Estado</Th><Th>Acciones</Th></tr></thead>
          <tbody>
            {items.map(({ source: s, lastCheck, failureStreak }) => (
              <tr key={s.id} className={`border-b border-cal-2 align-top ${s.active ? "" : "opacity-55"}`}>
                <td className="px-3 py-2"><Link href={`/admin/sources/${s.id}`} className="font-semibold text-ink hover:underline">{s.name}</Link>{s.aliases.length > 0 && <p className="text-xs text-cacao/60">{s.aliases.join(", ")}</p>}</td>
                <td className="px-3 py-2">{s.city ?? "—"}</td>
                <td className="px-3 py-2">{s.type}</td>
                <td className="px-3 py-2"><ExtLink href={s.urls.facebook}>Abrir</ExtLink>{s.urls.facebook && s.verification.facebook !== "verified" && <span title="Vínculo sin verificar" className="ml-1">⚠︎</span>}</td>
                <td className="px-3 py-2"><ExtLink href={s.urls.instagram}>Abrir</ExtLink></td>
                <td className="px-3 py-2 whitespace-nowrap">{relTime(lastCheck?.startedAt)}</td>
                <td className="px-3 py-2"><StatusBadge status={lastCheck?.status} />{failureStreak >= 2 && <p className="mt-1 text-xs text-rose-deep">{failureStreak} fallos seguidos</p>}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1.5">
                    <form action={checkSourceAction}><input type="hidden" name="id" value={s.id} /><button className={btn}>Revisar ahora</button></form>
                    <form action={toggleSourceAction}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="active" value={String(!s.active)} /><button className={btn}>{s.active ? "Desactivar" : "Activar"}</button></form>
                    <Link href={`/admin/sources/${s.id}`} className={btn}>Editar / historial</Link>
                    {u.role === "ADMIN" && <form action={deleteSourceAction}><input type="hidden" name="id" value={s.id} /><button className={btnDanger}>Eliminar</button></form>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="rounded-2xl bg-white p-5" open={items.length === 0}>
        <summary className="cursor-pointer font-display text-xl font-bold">Agregar fuente</summary>
        <form action={createSourceAction} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">Nombre<input name="name" required className={field} /></label>
          <label className="text-sm font-semibold">Identificador (slug)<input name="id" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="mi-operadora" className={field} /></label>
          <label className="text-sm font-semibold">Tipo<select name="type" className={field}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label className="text-sm font-semibold">Ciudad<input name="city" className={field} /></label>
          <label className="text-sm font-semibold">Facebook<input name="facebook" type="url" className={field} /></label>
          <label className="text-sm font-semibold">Instagram<input name="instagram" type="url" className={field} /></label>
          <label className="text-sm font-semibold">Sitio web<input name="website" type="url" className={field} /></label>
          <label className="text-sm font-semibold">Feed RSS<input name="rss" type="url" className={field} /></label>
          <label className="text-sm font-semibold sm:col-span-2">Alias (separados por coma)<input name="aliases" className={field} /></label>
          <fieldset className="sm:col-span-2"><legend className="text-sm font-semibold">Categorías</legend>
            <div className="mt-1 flex flex-wrap gap-2">{CATEGORIES.map((c) => <label key={c.id} className="text-sm"><input type="checkbox" name="categories" value={c.id} /> {c.emoji} {c.short}</label>)}</div>
          </fieldset>
          <label className="text-sm font-semibold sm:col-span-2">Notas<textarea name="notes" rows={2} className={field} /></label>
          <div className="sm:col-span-2"><button className={btnPrimary}>Guardar fuente</button></div>
        </form>
      </details>

      {u.role === "ADMIN" && (
        <details className="rounded-2xl bg-white p-5">
          <summary className="cursor-pointer font-display text-xl font-bold">Importar sources.json</summary>
          <form action={importSourcesAction} className="mt-4 space-y-3">
            <p className="text-sm">Archivo con el formato de <code>config/sources.json</code>. “Combinar” solo agrega fuentes nuevas; “Reemplazar coincidentes” sobrescribe las que tengan el mismo id.</p>
            <input type="file" name="file" accept="application/json" className="text-sm" />
            <label className="block text-sm font-semibold">…o pega el JSON<textarea name="json" rows={4} className={field} /></label>
            <select name="mode" className={field}><option value="merge">Combinar (no pisa lo existente)</option><option value="replace-matching">Reemplazar coincidentes</option></select>
            <button className={btnPrimary}>Importar</button>
          </form>
        </details>
      )}
    </div>
  );
}
