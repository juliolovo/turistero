import { notFound } from "next/navigation";
import type { EventItem } from "@turistero/types";
import { CATEGORIES, zonedParts } from "@turistero/config";
import { ApiFailure, adminFetch, requireRole } from "@/lib/admin";
import { ExtLink, Flash, btnPrimary, field } from "@/components/admin-ui";
import { updateEventAction } from "../../actions";

const pad = (n: number) => String(n).padStart(2, "0");

export default async function EditEvent({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [u, { id }, sp] = [await requireRole("EDITOR"), await params, await searchParams];
  const e = await adminFetch<EventItem>(u.id, `/events/${id}`).catch((x) => (x instanceof ApiFailure && x.status === 404 ? null : Promise.reject(x)));
  if (!e) notFound();
  const p = zonedParts(new Date(e.startsAt), e.timezone);
  const local = `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;

  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="font-display text-3xl font-extrabold text-ink">Editar evento</h1>
      <Flash ok={sp.ok} error={sp.error} />
      <p className="text-sm">Fuentes: {e.sources.map((s, i) => <span key={i}>{i > 0 && " · "}{s.originalPostUrl ? <ExtLink href={s.originalPostUrl}>{s.sourceName}</ExtLink> : `${s.sourceName} (sin enlace directo)`}</span>)}</p>
      <form action={updateEventAction} className="grid gap-3 rounded-2xl bg-white p-5 sm:grid-cols-2">
        <input type="hidden" name="id" value={e.id} /><input type="hidden" name="timezone" value={e.timezone} />
        <label className="text-sm font-semibold sm:col-span-2">Título (sin emojis: se agregan solos)<input name="title" defaultValue={e.title} required className={field} /></label>
        <label className="text-sm font-semibold">Categoría<select name="category" defaultValue={e.category} className={field}>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}</select></label>
        <label className="text-sm font-semibold">Confianza<select name="confidence" defaultValue={e.confidence} className={field}><option>HIGH</option><option>MEDIUM</option><option>LOW</option></select></label>
        <label className="text-sm font-semibold">Inicio (hora local del evento)<input type="datetime-local" name="start" defaultValue={local} required className={field} /></label>
        <label className="text-sm font-semibold">Lugar<input name="venue" defaultValue={e.venue} required className={field} /></label>
        <label className="text-sm font-semibold sm:col-span-2">Dirección<input name="address" defaultValue={e.address ?? ""} className={field} /></label>
        <label className="text-sm font-semibold sm:col-span-2">Descripción<textarea name="description" rows={5} defaultValue={e.description} className={field} /></label>
        <div className="sm:col-span-2"><button className={btnPrimary}>Guardar</button></div>
      </form>
    </div>
  );
}
