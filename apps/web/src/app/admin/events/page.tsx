import type { EventItem } from "@turistero/types";
import { displayTitle, formatPrice, getPlace } from "@turistero/config";
import { adminFetch, requireRole, type Page } from "@/lib/admin";
import { ExtLink, Flash, Link, Th, btn, btnPrimary, field, fmtDateTime } from "@/components/admin-ui";
import { eventStatusAction, mergeEventAction } from "../actions";

const TABS = [
  { key: "PENDING", label: "Por revisar" },
  { key: "PUBLISHED", label: "Publicados" },
  { key: "HIDDEN", label: "Ocultos" },
] as const;

export default async function AdminEvents({ searchParams }: { searchParams: Promise<{ status?: string; ok?: string; error?: string }> }) {
  const [u, sp] = [await requireRole("EDITOR"), await searchParams];
  const status = TABS.find((t) => t.key === sp.status)?.key ?? "PENDING";
  const data = await adminFetch<Page<EventItem>>(u.id, `/events?range=custom&from=2020-01-01&to=2100-01-01&status=${status}&sort=new&pageSize=100`);
  const options = data.items;

  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-extrabold text-ink">Eventos</h1>
      <Flash ok={sp.ok} error={sp.error} />
      <nav aria-label="Estado de los eventos" className="flex gap-2">
        {TABS.map((t) => <Link key={t.key} href={`/admin/events?status=${t.key}`} aria-current={t.key === status ? "true" : undefined} className={`rounded-full px-4 py-2 text-sm font-semibold ${t.key === status ? "bg-ink text-white" : "border border-ink/20 bg-white"}`}>{t.label}</Link>)}
      </nav>
      <p className="text-sm">{data.total} evento(s). Los de confianza <strong>LOW</strong> no se muestran al público hasta que los apruebes.</p>

      <ul className="space-y-3">
        {options.map((e) => {
          const direct = e.sources.filter((s) => s.originalPostUrl);
          return (
            <li key={e.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-lg font-bold text-ink">{displayTitle(e)}{e.isMock && <span className="ml-2 rounded-full bg-cal-2 px-2 py-0.5 text-xs">ejemplo</span>}</p>
                  <p className="text-sm">{fmtDateTime(e.startsAt, e.timezone)} · {e.venue} · {getPlace(e.placeId)?.name} · {formatPrice(e.price)}</p>
                  <p className="text-sm">Confianza: <strong className={e.confidence === "LOW" ? "text-rose-deep" : ""}>{e.confidence}</strong> · Fuentes: {e.sources.map((s) => s.sourceName).join(", ")}</p>
                  <p className="text-sm">{direct.length ? direct.map((s, i) => <ExtLink key={i} href={s.originalPostUrl}>Publicación original ({s.sourceName})</ExtLink>) : <span className="font-semibold text-rose-deep">Sin enlace directo a la publicación</span>}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {status !== "PUBLISHED" && <form action={eventStatusAction}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="status" value="PUBLISHED" /><input type="hidden" name="confidence" value={e.confidence} /><button className={btnPrimary}>Aprobar</button></form>}
                  {status !== "HIDDEN" && <form action={eventStatusAction}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="status" value="HIDDEN" /><button className={btn}>Ocultar</button></form>}
                  <Link href={`/admin/events/${e.id}`} className={btn}>Editar</Link>
                  <Link href={`/events/${e.slug}`} className={btn}>Ver público</Link>
                </div>
              </div>
              {options.length > 1 && (
                <form action={mergeEventAction} className="mt-3 flex flex-wrap items-center gap-2 border-t border-cal-2 pt-3 text-sm">
                  <input type="hidden" name="id" value={e.id} />
                  <label htmlFor={`m-${e.id}`} className="font-semibold">¿Duplicado de…?</label>
                  <select id={`m-${e.id}`} name="intoId" className={`${field} max-w-xs`} required defaultValue="">
                    <option value="" disabled>Elegir evento destino</option>
                    {options.filter((o) => o.id !== e.id).map((o) => <option key={o.id} value={o.id}>{o.title} · {fmtDateTime(o.startsAt, o.timezone)}</option>)}
                  </select>
                  <button className={btn}>Fusionar</button>
                </form>
              )}
            </li>
          );
        })}
        {!options.length && <li className="rounded-2xl bg-white p-6 text-center">No hay eventos en esta lista.</li>}
      </ul>
    </div>
  );
}
