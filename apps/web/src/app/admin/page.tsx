import { requireRole, adminFetch, type Page, type StatusRow } from "@/lib/admin";
import { Flash, Link, StatusBadge, fmtDateTime } from "@/components/admin-ui";

const ALL = "range=custom&from=2020-01-01&to=2100-01-01&pageSize=1";

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [u, sp] = [await requireRole("EDITOR"), await searchParams];
  const [pending, low, cands, status, runs] = await Promise.all([
    adminFetch<Page<unknown>>(u.id, `/events?${ALL}&status=PENDING`),
    adminFetch<Page<unknown>>(u.id, `/events?${ALL}&confidence=LOW`),
    adminFetch<Page<unknown>>(u.id, "/source-candidates?status=PENDING&pageSize=1"),
    adminFetch<{ items: StatusRow[] }>(u.id, "/sources/status"),
    adminFetch<Page<{ id: string; trigger: string; startedAt: string; status: string; sourcesChecked: number; newEvents: number }>>(u.id, "/discovery-runs?pageSize=1"),
  ]);
  const failing = status.items.filter((r) => r.failureStreak >= 2 || r.lastCheck?.status === "ERROR");
  const neverChecked = status.items.filter((r) => r.source.active && !r.lastCheck).length;
  const last = runs.items[0];
  const card = "rounded-2xl bg-white p-5 shadow-sm";

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-extrabold text-ink">Resumen</h1>
      <Flash ok={sp.ok} error={sp.error} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="/admin/events?status=PENDING" className={`${card} block hover:shadow-md`}><p className="text-3xl font-extrabold">{pending.total}</p><p className="text-sm">Eventos por revisar</p></Link>
        <Link href="/admin/events?status=PENDING" className={`${card} block hover:shadow-md`}><p className="text-3xl font-extrabold">{low.total}</p><p className="text-sm">Con confianza baja</p></Link>
        <Link href="/admin/candidates" className={`${card} block hover:shadow-md`}><p className="text-3xl font-extrabold">{cands.total}</p><p className="text-sm">Fuentes candidatas</p></Link>
        <Link href="/admin/sources/status" className={`${card} block hover:shadow-md`}><p className="text-3xl font-extrabold">{neverChecked}</p><p className="text-sm">Fuentes activas sin revisar</p></Link>
      </div>
      <section className={card}>
        <h2 className="font-display text-xl font-bold">Última corrida</h2>
        {last ? (
          <p className="mt-1 text-sm">{fmtDateTime(last.startedAt)} · {last.trigger} · <StatusBadge status={last.status === "COMPLETED" ? "SUCCESS" : last.status === "FAILED" ? "ERROR" : "RATE_LIMITED"} /> · {last.sourcesChecked} fuentes, {last.newEvents} eventos nuevos</p>
        ) : <p className="mt-1 text-sm">Aún no hay corridas. <Link href="/admin/runs" className="font-semibold underline">Ejecutar una</Link>.</p>}
      </section>
      <section className={card}>
        <h2 className="font-display text-xl font-bold">Fuentes que necesitan atención</h2>
        {failing.length === 0 ? <p className="mt-1 text-sm">Ninguna con fallos repetidos.</p> : (
          <ul className="mt-2 space-y-1 text-sm">
            {failing.map((r) => <li key={r.source.id}><Link href={`/admin/sources/${r.source.id}`} className="font-semibold underline">{r.source.name}</Link> — <StatusBadge status={r.lastCheck?.status} /> ({r.failureStreak} revisiones seguidas con problema)</li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
