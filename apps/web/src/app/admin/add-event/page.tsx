import { placesOf, DEFAULT_COUNTRY } from "@turistero/config";
import { requireRole } from "@/lib/admin";
import { Flash, btnPrimary, field } from "@/components/admin-ui";
import { addEventAction } from "../actions";

export default async function AddEvent({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireRole("EDITOR");
  const sp = await searchParams;
  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="font-display text-3xl font-extrabold text-ink">Agregar evento</h1>
      <p className="text-sm">Pega el enlace público de una publicación o página de evento, o el texto de una publicación. Solo se crea un evento si hay una fecha reconocible; nunca se inventan datos. La URL se conserva como “publicación original”.</p>
      <Flash ok={sp.ok} error={sp.error} />
      <form action={addEventAction} className="grid gap-3 rounded-2xl bg-white p-5">
        <label className="text-sm font-semibold">Enlace público<input name="url" type="url" placeholder="https://…" className={field} /></label>
        <p className="text-center text-xs">— o —</p>
        <label className="text-sm font-semibold">Texto de la publicación<textarea name="text" rows={5} className={field} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">Organizador / fuente<input name="organizer" className={field} /></label>
          <label className="text-sm font-semibold">Ciudad<select name="city" className={field}><option value="">(detectar)</option>{placesOf(DEFAULT_COUNTRY).map((p) => <option key={p.id}>{p.name}</option>)}</select></label>
        </div>
        <label className="text-sm"><input type="checkbox" name="publish" /> Publicar aunque la confianza sea baja (asumo la responsabilidad)</label>
        <div><button className={btnPrimary}>Procesar</button></div>
      </form>
    </div>
  );
}
