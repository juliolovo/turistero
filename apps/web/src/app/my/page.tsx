import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { placesOf, DEFAULT_COUNTRY } from "@turistero/config";
import { auth } from "@/auth";
import { adminFetch, type Page, type SourceDto } from "@/lib/admin";
import { apiConfigured } from "@/lib/session-api";
import { EmptyState } from "@/components/states";
import { ExtLink, Flash, btn, btnDanger, btnPrimary, field, relTime } from "@/components/admin-ui";
import { checkMySourceAction, createMySourceAction, deleteMySourceAction, subscribeAction, toggleMySourceAction } from "./actions";

export const metadata: Metadata = { title: "Mis fuentes" };

interface Mine { private: SourceDto[]; subscribed: { source: SourceDto; enabled: boolean; alias: string | null }[]; limit: number }

export default async function MySources({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [session, sp] = [await auth(), await searchParams];
  if (!session?.user?.id) redirect("/login?callbackUrl=/my");
  if (!apiConfigured()) {
    return <div className="mx-auto max-w-3xl px-4 py-16"><EmptyState emoji="🔌" title="Tus fuentes no están disponibles" hint="La API no está configurada en este entorno." /></div>;
  }
  const uid = session.user.id;
  const [mine, catalog] = await Promise.all([adminFetch<Mine>(uid, "/my/sources"), adminFetch<Page<SourceDto>>(uid, "/sources?active=true&pageSize=100")]);
  const subscribed = new Set(mine.subscribed.filter((s) => s.enabled).map((s) => s.source.id));

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <div>
        <h1 className="font-display text-3xl font-extrabold text-ink">Mis fuentes</h1>
        <p className="mt-1 max-w-2xl text-sm">Las páginas y sitios que sigues. Turistero revisa solo estos (y las fuentes del catálogo que elijas) y arma <Link href="/?mine=1" className="font-semibold underline">tu agenda</Link>. Lo que encuentre en tus fuentes propias lo ves solo tú.</p>
      </div>
      <Flash ok={sp.ok} error={sp.error} />

      <section aria-labelledby="propias" className="space-y-3">
        <h2 id="propias" className="font-display text-2xl font-bold text-ink">Fuentes propias <span className="text-base font-semibold text-cacao/60">({mine.private.length}/{mine.limit})</span></h2>
        <ul className="space-y-3">
          {mine.private.map((s) => (
            <li key={s.id} className={`rounded-2xl bg-white p-4 shadow-sm ${s.active ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-lg font-bold text-ink">{s.name}{!s.active && <span className="ml-2 rounded-full bg-cal-2 px-2 py-0.5 text-xs">en pausa</span>}</p>
                  <p className="text-sm">{s.city ?? "Sin ciudad"} · Última revisión: {relTime(s.lastReviewedAt)}</p>
                  <p className="text-sm">Sitio: <ExtLink href={s.urls.website}>abrir</ExtLink> · Facebook: <ExtLink href={s.urls.facebook}>abrir</ExtLink> · Instagram: <ExtLink href={s.urls.instagram}>abrir</ExtLink> · RSS: <ExtLink href={s.urls.rss}>abrir</ExtLink></p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <form action={checkMySourceAction}><input type="hidden" name="id" value={s.id} /><button className={btn}>Revisar ahora</button></form>
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
          <p className="text-xs text-cacao/70 sm:col-span-2">Sitios web y feeds se leen ya. Facebook e Instagram solo se leen por la API oficial de Meta, que aún requiere una conexión autorizada: hasta entonces esas fuentes se guardan y quedan como “requiere autenticación”.</p>
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
