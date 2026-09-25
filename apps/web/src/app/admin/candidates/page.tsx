import { adminFetch, requireRole, type Page, type SourceDto } from "@/lib/admin";
import { ExtLink, Flash, btn, btnPrimary, field, fmtDateTime } from "@/components/admin-ui";
import { candidateAction } from "../actions";

interface Candidate { id: string; name: string; city: string | null; category: string | null; discoveredFrom: string | null; urls: { website: string | null; facebook: string | null; instagram: string | null }; confidence: string; status: string; discoveredAt: string }

export default async function Candidates({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [u, sp] = [await requireRole("EDITOR"), await searchParams];
  const [cands, sources] = await Promise.all([
    adminFetch<Page<Candidate>>(u.id, "/source-candidates?status=PENDING&pageSize=100"),
    adminFetch<Page<SourceDto>>(u.id, "/sources?pageSize=100"),
  ]);
  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-extrabold text-ink">Fuentes candidatas</h1>
      <p className="text-sm">Perfiles y sitios que aparecieron mientras se revisaban otras fuentes. Nunca se agregan solos: tú decides. Al <strong>fusionar</strong> solo se completan URLs vacías de la fuente elegida.</p>
      <Flash ok={sp.ok} error={sp.error} />
      <ul className="space-y-3">
        {cands.items.map((c) => (
          <li key={c.id} className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="font-display text-lg font-bold text-ink">{c.name} <span className="text-sm font-normal text-cacao/70">· confianza {c.confidence}</span></p>
            <p className="text-sm">Encontrada: {fmtDateTime(c.discoveredAt)} · Origen: {c.discoveredFrom ?? "—"} · Ciudad: {c.city ?? "—"}</p>
            <p className="text-sm">Facebook: <ExtLink href={c.urls.facebook}>abrir</ExtLink> · Instagram: <ExtLink href={c.urls.instagram}>abrir</ExtLink> · Web: <ExtLink href={c.urls.website}>abrir</ExtLink></p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <form action={candidateAction}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="action" value="approve" /><button className={btnPrimary}>Aprobar como fuente</button></form>
              <form action={candidateAction}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="action" value="reject" /><button className={btn}>Rechazar</button></form>
              <form action={candidateAction} className="flex items-center gap-2">
                <input type="hidden" name="id" value={c.id} /><input type="hidden" name="action" value="merge" />
                <label htmlFor={`f-${c.id}`} className="sr-only">Fusionar con</label>
                <select id={`f-${c.id}`} name="intoSourceId" required defaultValue="" className={`${field} max-w-xs`}><option value="" disabled>Fusionar con…</option>{sources.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                <button className={btn}>Fusionar</button>
              </form>
            </div>
          </li>
        ))}
        {!cands.items.length && <li className="rounded-2xl bg-white p-6 text-center">No hay candidatos pendientes. Aparecen cuando una revisión encuentra perfiles nuevos.</li>}
      </ul>
    </div>
  );
}
