import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { placesOf, DEFAULT_COUNTRY } from "@turistero/config";
import { auth } from "@/auth";
import { adminFetch, type Page, type SourceDto } from "@/lib/admin";
import { apiConfigured } from "@/lib/session-api";
import { EmptyState } from "@/components/states";
import { AutoRefresh } from "@/components/auto-refresh";
import { ExtLink, Flash, btn, btnDanger, btnPrimary, field, fmtDateTime, relTime } from "@/components/admin-ui";
import { checkMySourceAction, createMySourceAction, deleteMySourceAction, markReadAction, saveScheduleAction, subscribeAction, toggleMySourceAction } from "./actions";

export const metadata: Metadata = { title: "Mis fuentes" };

interface MyPrivate extends SourceDto { scanning: boolean; nextCheckAt: string | null; lastStatus: string | null; lastMessage: string | null }
interface Mine { private: MyPrivate[]; subscribed: { source: SourceDto; enabled: boolean; alias: string | null }[]; limit: number }
interface Schedule { enabled: boolean; days: number[]; hour: number; minute: number; timezone: string; lastRunAt: string | null }
interface Notifs { items: { id: string; kind: string; message: string; createdAt: string; readAt: string | null }[]; unread: number }

const DAYS = [["1", "Lun"], ["2", "Mar"], ["3", "Mié"], ["4", "Jue"], ["5", "Vie"], ["6", "Sáb"], ["0", "Dom"]] as const;
const ZONES = ["America/Managua", "America/Mexico_City", "America/Bogota", "America/Lima", "America/Santiago", "America/Argentina/Buenos_Aires", "America/New_York", "America/Los_Angeles", "Europe/Madrid", "UTC"];
const KIND_ICON: Record<string, string> = { SCAN_STARTED: "🔎", NEW_EVENTS: "🆕", SCAN_FAILED: "⚠️", INFO: "ℹ️" };
const pad = (n: number) => String(n).padStart(2, "0");

export default async function MySources({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [session, sp] = [await auth(), await searchParams];
  if (!session?.user?.id) redirect("/login?callbackUrl=/my");
  if (!apiConfigured()) {
    return <div className="mx-auto max-w-3xl px-4 py-16"><EmptyState emoji="🔌" title="Tus fuentes no están disponibles" hint="La API no está configurada en este entorno." /></div>;
  }
  const uid = session.user.id;
  const [mine, catalog, schedule, notes] = await Promise.all([
    adminFetch<Mine>(uid, "/my/sources"),
    adminFetch<Page<SourceDto>>(uid, "/sources?active=true&pageSize=100"),
    adminFetch<Schedule>(uid, "/my/schedule"),
    adminFetch<Notifs>(uid, "/my/notifications"),
  ]);
  const subscribed = new Set(mine.subscribed.filter((s) => s.enabled).map((s) => s.source.id));
  const scanning = mine.private.filter((s) => s.scanning);
  const zones = ZONES.includes(schedule.timezone) ? ZONES : [schedule.timezone, ...ZONES];

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <AutoRefresh active={scanning.length > 0} />
      <div>
        <h1 className="font-display text-3xl font-extrabold text-ink">Mis fuentes</h1>
        <p className="mt-1 max-w-2xl text-sm">Las páginas y sitios que sigues. Turistero los visita <strong>pocas veces y con calma</strong>: como máximo una vez al día por fuente, sin navegador ni consultas constantes, y arma <Link href="/?mine=1" className="font-semibold underline">tu agenda</Link>. Lo que encuentre en tus fuentes propias lo ves solo tú.</p>
      </div>
      <Flash ok={sp.ok} error={sp.error} />

      {scanning.length > 0 && (
        <p role="status" className="rounded-xl bg-mango/40 px-4 py-3 text-sm font-semibold">🔎 Revisando ahora: {scanning.map((s) => s.name).join(", ")}… Esta página se actualiza sola.</p>
      )}

      <section aria-labelledby="novedades" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="novedades" className="font-display text-2xl font-bold text-ink">Novedades {notes.unread > 0 && <span className="rounded-full bg-rose px-2.5 py-0.5 text-sm text-ink">{notes.unread} nuevas</span>}</h2>
          {notes.unread > 0 && <form action={markReadAction}><button className={btn}>Marcar como leídas</button></form>}
        </div>
        <ul className="space-y-2">
          {notes.items.slice(0, 8).map((n) => (
            <li key={n.id} className={`rounded-xl px-4 py-2.5 text-sm ${n.readAt ? "bg-white/60" : "bg-white font-medium shadow-sm"}`}>
              <span aria-hidden>{KIND_ICON[n.kind] ?? "•"}</span> {n.message} <span className="text-xs text-cacao/75">· {relTime(n.createdAt)}</span>
            </li>
          ))}
          {!notes.items.length && <li className="rounded-xl border border-dashed border-ink/25 bg-white/60 px-4 py-4 text-center text-sm">Aún no hay novedades. Te avisamos aquí cuando una revisión empiece o encuentre eventos.</li>}
        </ul>
      </section>

      <section aria-labelledby="horario" className="space-y-3">
        <h2 id="horario" className="font-display text-2xl font-bold text-ink">¿Cuándo revisar?</h2>
        <form action={saveScheduleAction} className="space-y-4 rounded-2xl bg-white p-5">
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="enabled" defaultChecked={schedule.enabled} /> Revisión automática activada</label>
          <fieldset>
            <legend className="text-sm font-semibold">Días</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {DAYS.map(([v, l]) => <label key={v} className="rounded-full border border-ink/20 px-3 py-1.5 text-sm has-[:checked]:bg-ink has-[:checked]:text-white"><input type="checkbox" name="days" value={v} defaultChecked={schedule.days.includes(+v)} className="sr-only" /> {l}</label>)}
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-semibold">Hora<input type="time" name="time" defaultValue={`${pad(schedule.hour)}:${pad(schedule.minute)}`} required className={field} /></label>
            <label className="text-sm font-semibold sm:col-span-2">Zona horaria<select name="timezone" defaultValue={schedule.timezone} className={field}>{zones.map((z) => <option key={z}>{z}</option>)}</select></label>
          </div>
          <p className="text-xs text-cacao/70">Por defecto: lunes, miércoles y viernes a las 5:15 a. m. Cada fuente se revisa una vez en tu día; si falla por un problema temporal se reintenta una sola vez, una hora después. {schedule.lastRunAt && <>Última revisión programada: {fmtDateTime(schedule.lastRunAt, schedule.timezone)}.</>}</p>
          <button className={btnPrimary}>Guardar horario</button>
        </form>
      </section>

      <section aria-labelledby="propias" className="space-y-3">
        <h2 id="propias" className="font-display text-2xl font-bold text-ink">Fuentes propias <span className="text-base font-semibold text-cacao/75">({mine.private.length}/{mine.limit})</span></h2>
        <ul className="space-y-3">
          {mine.private.map((s) => (
            <li key={s.id} className={`rounded-2xl bg-white p-4 shadow-sm ${s.active ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-lg font-bold text-ink">{s.name}{!s.active && <span className="ml-2 rounded-full bg-cal-2 px-2 py-0.5 text-xs">en pausa</span>}{s.scanning && <span className="ml-2 rounded-full bg-mango px-2 py-0.5 text-xs">🔎 revisando ahora</span>}</p>
                  <p className="text-sm">{s.city ?? "Sin ciudad"} · Última revisión: {relTime(s.lastReviewedAt)}{s.lastStatus && <> · {s.lastStatus}</>}</p>
                  {s.lastMessage && <p className="text-xs text-cacao/70">{s.lastMessage}</p>}
                  <p className="text-sm">Sitio: <ExtLink href={s.urls.website}>abrir</ExtLink> · Facebook: <ExtLink href={s.urls.facebook}>abrir</ExtLink> · Instagram: <ExtLink href={s.urls.instagram}>abrir</ExtLink> · RSS: <ExtLink href={s.urls.rss}>abrir</ExtLink></p>
                  {s.nextCheckAt && <p className="text-xs text-cacao/70">Podrás volver a buscar ahora: {fmtDateTime(s.nextCheckAt, schedule.timezone)}</p>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <form action={checkMySourceAction}><input type="hidden" name="id" value={s.id} /><button disabled={s.scanning || !!s.nextCheckAt} className={`${btn} disabled:cursor-not-allowed disabled:opacity-50`}>Buscar ahora</button></form>
                  <form action={toggleMySourceAction}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="active" value={String(!s.active)} /><button className={btn}>{s.active ? "Pausar" : "Reactivar"}</button></form>
                  <form action={deleteMySourceAction}><input type="hidden" name="id" value={s.id} /><button className={btnDanger}>Eliminar</button></form>
                </div>
              </div>
            </li>
          ))}
          {!mine.private.length && <li className="rounded-2xl border border-dashed border-ink/25 bg-white/60 p-6 text-center text-sm">Aún no agregas ninguna. Pega el enlace de la página de una operadora o de un lugar que sigas.</li>}
        </ul>

        <form action={createMySourceAction} className="grid gap-3 rounded-2xl bg-white p-5 sm:grid-cols-2">
          <h3 className="font-display text-xl font-bold sm:col-span-2">Agregar una fuente</h3>
          <label className="text-sm font-semibold">Nombre<input name="name" required className={field} placeholder="Ej. Mi operadora favorita" /></label>
          <label className="text-sm font-semibold">Ciudad<select name="city" className={field}><option value="">(sin ciudad)</option>{placesOf(DEFAULT_COUNTRY).map((p) => <option key={p.id}>{p.name}</option>)}</select></label>
          <label className="text-sm font-semibold">Sitio web<input name="website" type="url" className={field} placeholder="https://…" /></label>
          <label className="text-sm font-semibold">Feed RSS<input name="rss" type="url" className={field} placeholder="https://…/feed" /></label>
          <label className="text-sm font-semibold">Facebook<input name="facebook" type="url" className={field} placeholder="https://facebook.com/…" /></label>
          <label className="text-sm font-semibold">Instagram<input name="instagram" type="url" className={field} placeholder="https://instagram.com/…" /></label>
          <p className="text-xs text-cacao/70 sm:col-span-2">Sitios web y feeds se leen ya. Facebook e Instagram solo se leen por la API oficial de Meta, que aún requiere una conexión autorizada: hasta entonces esas fuentes se guardan y quedan como “requiere autenticación”. No se hace scraping de esas redes.</p>
          <div className="sm:col-span-2"><button className={btnPrimary}>Guardar fuente</button></div>
        </form>
      </section>

      <section aria-labelledby="catalogo" className="space-y-3">
        <h2 id="catalogo" className="font-display text-2xl font-bold text-ink">Catálogo compartido</h2>
        <p className="text-sm">Fuentes revisadas para todos. Actívalas para que aparezcan en tu agenda.</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {catalog.items.map((s) => {
            const on = subscribed.has(s.id);
            return (
              <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3">
                <span className="min-w-0"><span className="block truncate font-semibold text-ink">{s.name}</span><span className="text-xs text-cacao/70">{s.city ?? "—"} · {s.type}</span></span>
                <form action={subscribeAction}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="on" value={String(!on)} /><button aria-pressed={on} className={on ? `${btn} bg-ink text-white` : btn}>{on ? "En mi agenda" : "Añadir"}</button></form>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
