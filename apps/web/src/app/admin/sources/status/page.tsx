import { adminFetch, requireRole, type StatusRow } from "@/lib/admin";
import { Flash, Link, STATUS_META, fmtDateTime, relTime, btn } from "@/components/admin-ui";
import { checkSourceAction, runNowAction } from "../../actions";

export default async function StatusPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [u, sp] = [await requireRole("EDITOR"), await searchParams];
  const { items } = await adminFetch<{ items: StatusRow[] }>(u.id, "/sources/status");
  const rows = items.filter((r) => r.source.active).sort((a, b) => Number(!!b.lastCheck) - Number(!!a.lastCheck) || (b.failureStreak - a.failureStreak));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-extrabold text-ink">Estado de fuentes</h1>
        <form action={runNowAction}><button className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-rose-deep">Ejecutar búsqueda ahora</button></form>
      </div>
      <p className="text-sm">Cada corrida registra <strong>todas</strong> las fuentes activas: ninguna desaparece del reporte.</p>
      <Flash ok={sp.ok} error={sp.error} />
      <ul className="space-y-3">
        {rows.map(({ source: s, lastCheck: c, failureStreak }) => {
          const m = c ? STATUS_META[c.status] : null;
          return (
            <li key={s.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-display text-lg font-bold text-ink"><span aria-hidden>{m?.icon ?? "•"}</span> <Link href={`/admin/sources/${s.id}`} className="hover:underline">{s.name}</Link></p>
                  <p className="text-sm">Última revisión: {c ? `${relTime(c.startedAt)} (${fmtDateTime(c.startedAt)})` : "nunca"}</p>
                  {c && <p className="text-sm">{c.postsReviewed} publicación(es) revisada(s) · {c.eventsFound} evento(s) encontrado(s)</p>}
                  <p className={`text-sm ${c && c.status !== "SUCCESS" && c.status !== "NO_EVENTS" ? "font-semibold" : ""}`}>{c ? (m?.label ?? c.status) : "Sin revisar todavía"}{c?.message ? ` — ${c.message}` : ""}</p>
                  {failureStreak >= 2 && <p className="text-sm font-semibold text-rose-deep">⚠ {failureStreak} revisiones seguidas con problema</p>}
                </div>
                <form action={checkSourceAction}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="back" value="/admin/sources/status" /><button className={btn}>Revisar ahora</button></form>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
