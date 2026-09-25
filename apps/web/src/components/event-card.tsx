import Image from "next/image";
import Link from "next/link";
import { CalendarDays, MapPin, Ticket, Link2Off } from "lucide-react";
import type { EventItem } from "@turistero/types";
import { displayTitle, formatPrice, formatShortDay, formatTime, getCategory, getPlace, isNew } from "@turistero/config";
import { CategoryArt } from "./category-art";
import { FavoriteButton } from "./favorite-button";
import type { FavoriteState } from "@/lib/favorites";

export function EventCard({ event, priority = false, fav }: { event: EventItem; priority?: boolean; fav?: FavoriteState }) {
  const cat = getCategory(event.category);
  const place = getPlace(event.placeId);
  const fresh = isNew(event.discoveredAt);
  const src = event.sources[0];
  const direct = event.sources.some((s) => s.originalPostUrl);

  return (
    <article className="tint group relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-[0_1px_0_rgba(20,18,58,0.08),0_10px_24px_-14px_rgba(20,18,58,0.35)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_18px_34px_-16px_rgba(20,18,58,0.5)]" style={{ ["--hue" as string]: cat.hue }}>
      <div className="relative aspect-[16/10] overflow-hidden">
        {event.image ? (
          <Image src={event.image.url} alt={event.image.alt ?? event.title} fill sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw" priority={priority} className="object-cover transition duration-300 group-hover:scale-[1.03]" />
        ) : (
          <CategoryArt category={event.category} className="size-full transition duration-300 group-hover:scale-[1.03]" />
        )}
        <div className="absolute left-3 top-3 flex gap-1.5">
          {fresh && <span className="rounded-full bg-mango px-2.5 py-1 text-xs font-bold text-ink">🆕 Nuevo</span>}
          {event.price.isFree && <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-ink">🆓 Gratis</span>}
        </div>
        {fav?.enabled && (
          <div className="absolute right-3 top-3">
            <FavoriteButton eventId={event.id} initial={fav.ids.has(event.id)} loggedIn={!!fav.userId} title={event.title} />
          </div>
        )}
        {event.isMock && <span className="absolute bottom-3 right-3 rounded-full bg-ink/80 px-2.5 py-1 text-xs font-medium text-white">Ejemplo</span>}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: "var(--tint-soft)", color: "var(--tint-deep)" }}>
          {cat.emoji} {cat.label}
        </p>
        <h3 className="font-display text-xl font-bold leading-tight text-ink">
          <Link href={`/events/${event.slug}`} className="after:absolute after:inset-0 after:content-['']">
            {displayTitle(event)}
          </Link>
        </h3>
        <ul className="space-y-1 text-sm">
          <li className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-rose-deep" aria-hidden />{event.venue}{place ? ` · ${place.name}` : ""}</li>
          <li className="flex items-start gap-2"><CalendarDays className="mt-0.5 size-4 shrink-0 text-rose-deep" aria-hidden />
            <span className="capitalize">{formatShortDay(event.startsAt, event.timezone)}</span> · {formatTime(event.startsAt, event.timezone)}
          </li>
          <li className="flex items-start gap-2"><Ticket className="mt-0.5 size-4 shrink-0 text-rose-deep" aria-hidden />{formatPrice(event.price)}</li>
        </ul>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-cal-2 pt-3 text-xs text-cacao/70">
          <span>Fuente: {src?.sourceName}</span>
          {!direct && <span className="inline-flex items-center gap-1"><Link2Off className="size-3.5" aria-hidden />Sin enlace directo</span>}
        </div>
        <span className="text-sm font-semibold text-rose-deep">Ver detalles</span>
      </div>
    </article>
  );
}
