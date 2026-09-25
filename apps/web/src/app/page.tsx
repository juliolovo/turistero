import { Suspense } from "react";
import { cookies } from "next/headers";
import Link from "next/link";
import { Search } from "lucide-react";
import type { DateRangeKey, EventQuery, PriceFilter, SortKey, ViewMode } from "@turistero/types";
import { CATEGORIES, COUNTRIES, DEFAULT_COUNTRY, getCategory, getPlace, isCategoryId, placesOf } from "@turistero/config";
import { queryEvents } from "@/lib/events-repo";
import { getFavoriteState } from "@/lib/favorites";
import { auth } from "@/auth";
import { first, href, type Params } from "@/lib/url";
import { EventCard } from "@/components/event-card";
import { EventTable } from "@/components/event-table";
import { ViewToggle } from "@/components/view-toggle";
import { EventsSkeleton } from "@/components/skeletons";
import { EmptyState } from "@/components/states";

type SP = Promise<Record<string, string | string[] | undefined>>;

const RANGES: { key: DateRangeKey; label: string; sub: string }[] = [
  { key: "today", label: "Hoy", sub: "esta noche y todo el día" },
  { key: "tomorrow", label: "Mañana", sub: "para ir planeando" },
  { key: "weekend", label: "Este fin de semana", sub: "viernes a domingo" },
  { key: "week", label: "Próximos 7 días", sub: "la semana completa" },
];

export default async function Home({ searchParams }: { searchParams: SP }) {
  const raw = await searchParams;
  const p: Params = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, first(v)]));
  const range = (["today", "tomorrow", "weekend", "week", "custom"].includes(p.range ?? "") ? p.range : "week") as DateRangeKey;
  const place = p.city ? getPlace(p.city) : undefined;
  const category = isCategoryId(p.category) ? p.category : undefined;
  const signedIn = (await auth())?.user;
  const cookieView = (await cookies()).get("view")?.value;
  const view: ViewMode = (p.view ?? cookieView) === "list" ? "list" : "cards";

  const query: EventQuery = {
    country: DEFAULT_COUNTRY,
    placeId: place?.id,
    category,
    range,
    from: p.from,
    to: p.to,
    price: (["free", "paid"].includes(p.price ?? "") ? p.price : "all") as PriceFilter,
    sort: (["new", "relevance"].includes(p.sort ?? "") ? p.sort : "date") as SortKey,
    q: p.q,
    mine: p.mine === "1" && !!signedIn,
  };
  const base: Params = { city: p.city, category: p.category, range: p.range, price: p.price, sort: p.sort, q: p.q, view: p.view, mine: p.mine };
  const where = place?.name ?? COUNTRIES[DEFAULT_COUNTRY]!.name;

  return (
    <>
      <section className="bg-ink text-white">
        <div className="hero-rise mx-auto max-w-6xl px-4 pb-10 pt-8 md:pb-14 md:pt-12">
          <h1 className="max-w-3xl font-display text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl">
            ¿Qué hacer esta semana en {where}?
          </h1>
          <form action="/" role="search" className="mt-6 flex max-w-xl gap-2">
            {p.city && <input type="hidden" name="city" value={p.city} />}
            <label htmlFor="q" className="sr-only">Buscar eventos</label>
            <input id="q" name="q" defaultValue={p.q} placeholder="rock, tour volcán, salsa, León, gratis…" className="min-w-0 flex-1 rounded-full bg-white px-5 py-3 text-ink placeholder:text-ink/50" />
            <button className="inline-flex items-center gap-2 rounded-full bg-rose px-5 py-3 font-semibold text-ink transition hover:brightness-110">
              <Search className="size-4" aria-hidden /> Buscar
            </button>
          </form>
          <nav aria-label="Rango de fechas" className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {RANGES.map((r, i) => (
              <Link
                key={r.key}
                href={href(base, { range: r.key === "week" ? undefined : r.key })}
                aria-current={range === r.key ? "true" : undefined}
                scroll={false}
                className={`relative rounded-xl px-5 py-4 transition [clip-path:polygon(0_0,100%_0,100%_calc(50%-8px),calc(100%-8px)_50%,100%_calc(50%+8px),100%_100%,0_100%,0_calc(50%+8px),8px_50%,0_calc(50%-8px))] ${
                  range === r.key ? "bg-mango text-ink" : "bg-ink-2 hover:bg-white hover:text-ink"
                } ${i % 2 ? "sm:rotate-[0.6deg]" : "sm:-rotate-[0.6deg]"}`}
              >
                <span className="block font-display text-lg font-bold">{r.label}</span>
                <span className="block text-sm opacity-75">{r.sub}</span>
              </Link>
            ))}
          </nav>
        </div>
      </section>

      <div id="eventos" className="mx-auto max-w-6xl scroll-mt-4 space-y-5 px-4 py-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Ciudad:</span>
          {[{ id: undefined, name: "Todas" }, ...placesOf(DEFAULT_COUNTRY)].map((c) => (
            <Chip key={c.id ?? "all"} active={p.city === c.id || (!p.city && !c.id)} to={href(base, { city: c.id })}>{c.name}</Chip>
          ))}
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Categorías">
          <Chip active={!category} to={href(base, { category: undefined, price: p.price === "free" ? "free" : undefined })}>Todo</Chip>
          {CATEGORIES.map((c) => (
            <Chip key={c.id} active={category === c.id} to={href(base, { category: c.id })}>{c.emoji} {c.short}</Chip>
          ))}
          <Chip active={p.price === "free"} to={href(base, { price: p.price === "free" ? undefined : "free" })}>🆓 Gratis</Chip>
          {signedIn && (
            <Chip active={!!query.mine} to={href(base, { mine: query.mine ? undefined : "1" })}>⭐ Mi agenda</Chip>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-cacao/80">
            Ordenar:{" "}
            {(["date", "new"] as const).map((s) => (
              <Link key={s} href={href(base, { sort: s === "date" ? undefined : s })} className={`mr-2 underline-offset-4 ${(p.sort ?? "date") === s ? "font-bold underline" : "hover:underline"}`}>
                {s === "date" ? "Fecha" : "Nuevos"}
              </Link>
            ))}
          </p>
          <ViewToggle current={view} hrefs={{ cards: href(base, { view: "cards" }, "#eventos"), list: href(base, { view: "list" }, "#eventos") }} />
        </div>

        <Suspense key={JSON.stringify(query) + view} fallback={<EventsSkeleton view={view} />}>
          <Results query={query} view={view} categoryLabel={category ? getCategory(category).label : undefined} />
        </Suspense>
      </div>

      <Suspense fallback={null}>
        <Suggestions category={category} placeId={place?.id} />
      </Suspense>

      <section id="ciudades" className="mx-auto max-w-6xl scroll-mt-4 px-4 pb-12">
        <h2 className="font-display text-2xl font-bold text-ink">Explorar por ciudad</h2>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {placesOf(DEFAULT_COUNTRY).map((c) => (
            <li key={c.id}>
              <Link href={href({}, { city: c.id }, "#eventos")} className="block rounded-xl border border-ink/15 bg-white px-4 py-5 font-display text-lg font-bold text-ink transition hover:-translate-y-0.5 hover:bg-mango">
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Chip({ active, to, children }: { active: boolean; to: string; children: React.ReactNode }) {
  return (
    <Link
      href={to}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${active ? "border-ink bg-ink text-white" : "border-ink/20 bg-white text-ink hover:border-ink"}`}
    >
      {children}
    </Link>
  );
}

async function Results({ query, view, categoryLabel }: { query: EventQuery; view: ViewMode; categoryLabel?: string }) {
  const [events, fav] = await Promise.all([queryEvents(query), getFavoriteState()]);
  if (!events.length) {
    return (
      <EmptyState
        emoji={query.category ? getCategory(query.category).emoji : "🔎"}
        title={categoryLabel ? `No encontramos ${categoryLabel} para estas fechas.` : "No encontramos eventos con esos filtros."}
        hint="Prueba ampliando la fecha o revisa otra ciudad."
        action={{ label: "Ver próximos 7 días en todas las ciudades", href: href({}, {}) }}
      />
    );
  }
  return (
    <section aria-labelledby="todos">
      <h2 id="todos" className="mb-3 font-display text-2xl font-bold text-ink">
        {events.length} {events.length === 1 ? "evento" : "eventos"}
      </h2>
      {view === "list" ? (
        <EventTable events={events} />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e, i) => <EventCard key={e.id} event={e} priority={i < 3} fav={fav} />)}
        </div>
      )}
    </section>
  );
}

async function Suggestions({ category, placeId }: { category?: string; placeId?: string }) {
  // Sin sistema de recomendación aún: cercanía temporal + ciudad/categoría vistas.
  const [pool, fav] = await Promise.all([queryEvents({ country: DEFAULT_COUNTRY, range: "week", placeId, sort: "new" }), getFavoriteState()]);
  const picks = pool.filter((e) => e.category !== category).slice(0, 4);
  if (picks.length < 3) return null;
  return (
    <section className="grain border-y border-cal-2 bg-white/50 py-10">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="font-display text-2xl font-bold text-ink">También podría interesarte</h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {picks.map((e) => <EventCard key={e.id} event={e} fav={fav} />)}
        </div>
      </div>
    </section>
  );
}
