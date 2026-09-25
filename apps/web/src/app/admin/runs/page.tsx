import { adminFetch, requireRole, type Page } from "@/lib/admin";
import { Flash, Th, btnPrimary, fmtDateTime } from "@/components/admin-ui";
import { runNowAction } from "../actions";

interface Run { id: string; trigger: string; startedAt: string; completedAt: string | null; sourcesChecked: number; eventsFound: number; newEvents: number; errors: number; status: string }

export default async function Runs({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [u, sp] = [await requireRole("EDITOR"), await searchParams];
  const runs = await adminFetch<Page<Run>>(u.id, "/discovery-runs?pageSize=50");
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-extrabold text-ink">Corridas de búsqueda</h1>
        <form action={runNowAction}><button className={btnPrimary}>Ejecutar búsqueda ahora</button></form>
      </div>
      <p className="text-sm">Automática: lunes, miércoles y viernes a las 5:15 a. m. (America/Managua). Puedes lanzarla a mano cuando quieras.</p>
      <Flash ok={sp.ok} error={sp.error} />
      <div className="overflow-x-auto rounded-2xl border border-cal-2 bg-white">
        <table className="w-full min-w-[44rem] text-sm">
          <caption className="sr-only">Historial de corridas</caption>
          <thead className="bg-ink text-white"><tr><Th>Inicio</Th><Th>Origen</Th><Th>Estado</Th><Th>Fuentes</Th><Th>Eventos</Th><Th>Nuevos</Th><Th>Errores</Th><Th>Duración</Th></tr></thead>
          <tbody>
            {runs.items.map((r) => (
              <tr key={r.id} className="border-b border-cal-2">
                <td className="whitespace-nowrap px-3 py-2">{fmtDateTime(r.startedAt)}</td><td className="px-3 py-2">{r.trigger === "CRON" ? "Programada" : "Manual"}</td>
                <td className="px-3 py-2">{r.status === "COMPLETED" ? "✅" : r.status === "PARTIAL" ? "⚠️" : r.status === "RUNNING" ? "⏳" : "❌"} {r.status}</td>
                <td className="px-3 py-2">{r.sourcesChecked}</td><td className="px-3 py-2">{r.eventsFound}</td><td className="px-3 py-2">{r.newEvents}</td><td className="px-3 py-2">{r.errors}</td>
                <td className="px-3 py-2">{r.completedAt ? `${Math.max(1, Math.round((+new Date(r.completedAt) - +new Date(r.startedAt)) / 1000))} s` : "—"}</td>
              </tr>
            ))}
            {!runs.items.length && <tr><td colSpan={8} className="px-3 py-6 text-center">Todavía no hay corridas.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
