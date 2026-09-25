import { notFound } from "next/navigation";
import { CATEGORIES } from "@turistero/config";
import { ApiFailure, adminFetch, requireRole, type CheckDto, type Page, type SourceDto } from "@/lib/admin";
import { ExtLink, Flash, StatusBadge, Th, btn, btnPrimary, field, fmtDateTime } from "@/components/admin-ui";
import { checkSourceAction, updateSourceAction } from "../../actions";

const TYPES = ["venue", "organizer", "tour-operator", "cultural", "mall", "institution", "media"];

export default async function SourceDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [u, { id }, sp] = [await requireRole("EDITOR"), await params, await searchParams];
  const [s, checks] = await Promise.all([
    adminFetch<SourceDto>(u.id, `/sources/${id}`).catch((e) => (e instanceof ApiFailure && e.status === 404 ? null : Promise.reject(e))),
    adminFetch<Page<CheckDto>>(u.id, `/sources/${id}/checks?pageSize=30`).catch(() => null),
  ]);
  if (!s) notFound();

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-extrabold text-ink">{s.name}</h1>
      <Flash ok={sp.ok} error={sp.error} />
      <p className="flex flex-wrap gap-4 text-sm">
        <ExtLink href={s.urls.facebook}>Abrir Facebook</ExtLink><ExtLink href={s.urls.instagram}>Abrir Instagram</ExtLink><ExtLink href={s.urls.website}>Abrir sitio</ExtLink>
        <span>Verificación: {Object.entries(s.verification).map(([k, v]) => `${k}: ${v}`).join(", ") || "sin verificar"}</span>
      </p>

      <form action={updateSourceAction} className="grid gap-3 rounded-2xl bg-white p-5 sm:grid-cols-2">
        <input type="hidden" name="id" value={s.id} />
        <label className="text-sm font-semibold">Nombre<input name="name" defaultValue={s.name} required className={field} /></label>
        <label className="text-sm font-semibold">Tipo<select name="type" defaultValue={s.type} className={field}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="text-sm font-semibold">Ciudad<input name="city" defaultValue={s.city ?? ""} className={field} /></label>
        <label className="text-sm font-semibold">Prioridad (0-100)<input name="priority" type="number" min={0} max={100} defaultValue={s.priority} className={field} /></label>
        <label className="text-sm font-semibold">Facebook<input name="facebook" type="url" defaultValue={s.urls.facebook ?? ""} className={field} /></label>
        <label className="text-sm font-semibold">Instagram<input name="instagram" type="url" defaultValue={s.urls.instagram ?? ""} className={field} /></label>
        <label className="text-sm font-semibold">Sitio web<input name="website" type="url" defaultValue={s.urls.website ?? ""} className={field} /></label>
        <label className="text-sm font-semibold">Feed RSS<input name="rss" type="url" defaultValue={s.urls.rss ?? ""} className={field} /></label>
        <label className="text-sm font-semibold sm:col-span-2">Alias (coma)<input name="aliases" defaultValue={s.aliases.join(", ")} className={field} /></label>
        <fieldset className="sm:col-span-2"><legend className="text-sm font-semibold">Categorías</legend>
          <div className="mt-1 flex flex-wrap gap-2">{CATEGORIES.map((c) => <label key={c.id} className="text-sm"><input type="checkbox" name="categories" value={c.id} defaultChecked={s.categories.includes(c.id)} /> {c.emoji} {c.short}</label>)}</div>
        </fieldset>
        <label className="text-sm font-semibold sm:col-span-2">Notas<textarea name="notes" rows={3} defaultValue={s.notes} className={field} /></label>
        <label className="text-sm font-semibold"><input type="checkbox" name="active" defaultChecked={s.active} /> Activa</label>
        <div className="flex gap-2 sm:col-span-2"><button className={btnPrimary}>Guardar cambios</button></div>
      </form>

      <form action={checkSourceAction}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="back" value={`/admin/sources/${s.id}`} /><button className={btn}>Revisar ahora</button></form>

      <section>
        <h2 className="mb-2 font-display text-xl font-bold">Historial de revisiones</h2>
        <div className="overflow-x-auto rounded-2xl border border-cal-2 bg-white">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-ink text-white"><tr><Th>Fecha</Th><Th>Estado</Th><Th>Revisadas</Th><Th>Eventos</Th><Th>Mensaje</Th></tr></thead>
            <tbody>
              {(checks?.items ?? []).map((c) => (
                <tr key={c.id} className="border-b border-cal-2 align-top"><td className="whitespace-nowrap px-3 py-2">{fmtDateTime(c.startedAt)}</td><td className="px-3 py-2"><StatusBadge status={c.status} /></td><td className="px-3 py-2">{c.postsReviewed}</td><td className="px-3 py-2">{c.eventsFound}</td><td className="px-3 py-2">{c.message}</td></tr>
              ))}
              {!checks?.items.length && <tr><td colSpan={5} className="px-3 py-4 text-center">Sin revisiones todavía.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
