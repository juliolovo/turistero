import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Link2Off } from "lucide-react";
import { BRAND, displayTitle, formatDay, formatPrice, formatTime, getCategory, getPlace } from "@turistero/config";
import type { EventItem } from "@turistero/types";
import { getAllSlugs, getEventBySlug, getRelatedEvents } from "@/lib/events-repo";
import { CategoryArt } from "@/components/category-art";
import { EventCard } from "@/components/event-card";
import { FavoriteButton } from "@/components/favorite-button";
import { getFavoriteState } from "@/lib/favorites";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  // Si la API no responde durante el build, las páginas se generan bajo demanda en vez de romper el despliegue.
  try {
    return (await getAllSlugs()).map((slug) => ({ slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const e = await getEventBySlug((await params).slug);
  if (!e) return {};
  const title = displayTitle(e);
  const description = `${formatDay(e.startsAt, e.timezone)} · ${formatTime(e.startsAt, e.timezone)} · ${e.venue}. ${e.description}`.slice(0, 200);
  return {
    title,
    description,
    alternates: { canonical: `/events/${e.slug}` },
    openGraph: { title, description, type: "article", images: e.image ? [e.image.url] : undefined },
    robots: e.isMock ? { index: false } : undefined, // los datos de ejemplo no se indexan
  };
}

function jsonLd(e: EventItem) {
  const place = getPlace(e.placeId);
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.title,
    description: e.description,
    startDate: e.startsAt,
    endDate: e.endsAt,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: { "@type": "Place", name: e.venue, address: { "@type": "PostalAddress", streetAddress: e.address, addressLocality: place?.name, addressCountry: e.country } },
    image: e.image?.url,
    organizer: e.organizer ? { "@type": "Organization", name: e.organizer.name, url: e.organizer.profileUrl } : undefined,
    offers: { "@type": "Offer", price: e.price.isFree ? 0 : e.price.min, priceCurrency: e.price.currency, availability: "https://schema.org/InStock" },
  };
}

export default async function EventPage({ params }: Props) {
  const e = await getEventBySlug((await params).slug);
  if (!e) notFound();
  const [related, fav] = await Promise.all([getRelatedEvents(e), getFavoriteState()]);
  const cat = getCategory(e.category);
  const place = getPlace(e.placeId);
  const main = e.sources.find((s) => s.originalPostUrl) ?? null;
  const profile = e.sources.find((s) => s.profileUrl);

  return (
    <article className="tint" style={{ ["--hue" as string]: cat.hue }}>
      {!e.isMock && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(e)).replace(/</g, "\\u003c") }} />}
      <div className="mx-auto max-w-5xl px-4 py-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-ink hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> Todos los eventos
        </Link>

        <div className="mt-4 grid gap-8 md:grid-cols-[1.1fr_1fr]">
          <div className="overflow-hidden rounded-2xl">
            {e.image ? (
              <Image src={e.image.url} alt={e.image.alt ?? e.title} width={e.image.width ?? 1200} height={e.image.height ?? 750} priority sizes="(min-width:768px) 50vw, 100vw" className="h-auto w-full" />
            ) : (
              <CategoryArt category={e.category} className="aspect-[16/10] w-full" />
            )}
            {e.image?.source && <p className="bg-white px-3 py-1.5 text-xs">Imagen: {e.image.source}</p>}
          </div>

          <div className="space-y-4">
            {e.isMock && <p className="rounded-lg bg-mango px-3 py-2 text-sm font-semibold text-ink">Dato de ejemplo: este evento es ficticio.</p>}
            <p className="w-fit rounded-full px-3 py-1 text-sm font-semibold" style={{ background: "var(--tint-soft)", color: "var(--tint-deep)" }}>{cat.emoji} {cat.label}</p>
            <div className="flex items-start justify-between gap-3">
              <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-ink">{displayTitle(e)}</h1>
              {fav.enabled && <FavoriteButton eventId={e.id} initial={fav.ids.has(e.id)} loggedIn={!!fav.userId} title={e.title} />}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[15px]">
              <dt className="font-semibold">Fecha</dt><dd className="capitalize">{formatDay(e.startsAt, e.timezone)}</dd>
              <dt className="font-semibold">Hora</dt><dd>{formatTime(e.startsAt, e.timezone)}{e.endsAt ? ` – ${formatTime(e.endsAt, e.timezone)}` : ""}</dd>
              <dt className="font-semibold">Lugar</dt><dd>{e.venue}</dd>
              <dt className="font-semibold">Ciudad</dt><dd>{place?.name}</dd>
              {e.address && (<><dt className="font-semibold">Dirección</dt><dd>{e.address}</dd></>)}
              <dt className="font-semibold">Precio</dt><dd>{formatPrice(e.price)}</dd>
              {e.organizer && (<><dt className="font-semibold">Organiza</dt><dd>{e.organizer.name}</dd></>)}
            </dl>

            <div className="space-y-2 pt-2">
              {main ? (
                <a href={main.originalPostUrl!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-rose px-6 py-3 font-bold text-ink transition hover:brightness-110">
                  Ver publicación original <ExternalLink className="size-4" aria-hidden />
                </a>
              ) : (
                <p className="inline-flex items-center gap-2 rounded-lg border border-ink/20 bg-white px-4 py-3 text-sm">
                  <Link2Off className="size-4 shrink-0" aria-hidden />
                  Sin enlace directo a la publicación. Solo conocemos el perfil de la fuente.
                </p>
              )}
              {profile?.profileUrl && (
                <p className="text-sm">
                  Perfil de la fuente:{" "}
                  <a href={profile.profileUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-rose-deep underline underline-offset-4">{profile.sourceName}</a>
                </p>
              )}
            </div>
          </div>
        </div>

        <section className="mt-8 max-w-2xl">
          <h2 className="font-display text-2xl font-bold text-ink">Descripción</h2>
          <p className="mt-2 leading-relaxed">{e.description}</p>
        </section>

        <section className="mt-8 rounded-2xl bg-white p-5">
          <h2 className="font-display text-xl font-bold text-ink">Fuentes y verificación</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {e.sources.map((s) => (
              <li key={s.sourceId + s.platform}>
                {s.sourceName} · {s.platform} · {s.urlKind === "EVENT_SOURCE_URL" ? "publicación concreta" : "solo perfil"}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-cacao/80">
            Descubierto {new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short", timeZone: e.timezone }).format(new Date(e.discoveredAt))}
            {" · "}última verificación {new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short", timeZone: e.timezone }).format(new Date(e.lastVerifiedAt))}
          </p>
        </section>

        {e.lat != null && e.lng != null && (
          <section className="mt-8">
            <h2 className="font-display text-xl font-bold text-ink">Mapa</h2>
            <iframe
              title={`Mapa de ${e.venue}`}
              loading="lazy"
              className="mt-2 h-64 w-full rounded-2xl border-0"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${e.lng - 0.01},${e.lat - 0.007},${e.lng + 0.01},${e.lat + 0.007}&marker=${e.lat},${e.lng}`}
            />
          </section>
        )}

        {related.length > 0 && (
          <section className="mt-10">
            <h2 className="font-display text-2xl font-bold text-ink">Eventos relacionados</h2>
            <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((r) => <EventCard key={r.id} event={r} fav={fav} />)}
            </div>
          </section>
        )}
        <p className="sr-only">{BRAND.name}</p>
      </div>
    </article>
  );
}
