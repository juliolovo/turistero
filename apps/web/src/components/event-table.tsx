import Link from "next/link";
import type { EventItem } from "@turistero/types";
import { displayTitle, formatPrice, formatShortDay, formatTime, getCategory, getPlace } from "@turistero/config";

/** Tabla en desktop; en móvil cada fila se apila como una ficha. */
export function EventTable({ events }: { events: EventItem[] }) {
  return (
    <div className="grain overflow-hidden rounded-2xl border border-cal-2 bg-white/60">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Eventos ordenados por fecha</caption>
        <thead className="hidden bg-ink text-white md:table-header-group">
          <tr>
            {["Fecha", "Hora", "Evento", "Lugar", "Categoría", "Precio", "Fuente"].map((h) => (
              <th key={h} scope="col" className="px-4 py-3 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="block md:table-row-group">
          {events.map((e) => {
            const cat = getCategory(e.category);
            return (
              <tr key={e.id} className="block border-b border-cal-2 p-4 transition last:border-0 hover:bg-mango/15 md:table-row md:p-0">
                <td className="block capitalize md:table-cell md:whitespace-nowrap md:px-4 md:py-3">{formatShortDay(e.startsAt, e.timezone)}</td>
                <td className="block md:table-cell md:whitespace-nowrap md:px-4 md:py-3">{formatTime(e.startsAt, e.timezone)}</td>
                <td className="block py-1 md:table-cell md:px-4 md:py-3">
                  <Link href={`/events/${e.slug}`} className="font-display text-base font-bold text-ink hover:text-rose-deep hover:underline">{displayTitle(e)}</Link>
                </td>
                <td className="block md:table-cell md:px-4 md:py-3">{e.venue} · {getPlace(e.placeId)?.name}</td>
                <td className="block md:table-cell md:whitespace-nowrap md:px-4 md:py-3">{cat.emoji} {cat.short}</td>
                <td className="block md:table-cell md:whitespace-nowrap md:px-4 md:py-3">{formatPrice(e.price)}</td>
                <td className="block text-cacao/70 md:table-cell md:px-4 md:py-3">{e.sources[0]?.sourceName}{e.isMock ? " (ejemplo)" : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
