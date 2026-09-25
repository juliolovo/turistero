import * as cheerio from "cheerio";

export interface JsonLdEvent {
  name: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  url?: string;
  image?: string;
  locationName?: string;
  locationAddress?: string;
  city?: string;
  lat?: number;
  lng?: number;
  organizer?: string;
  price?: number;
  priceCurrency?: string;
  free?: boolean;
}

export interface PageMeta {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  siteName?: string;
  publishedAt?: string;
  text: string;
  jsonLdEvents: JsonLdEvent[];
  feeds: string[];
  links: string[];
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const first = <T>(v: T | T[] | undefined): T | undefined => (Array.isArray(v) ? v[0] : v);

function typeIsEvent(t: unknown): boolean {
  const arr = Array.isArray(t) ? t : [t];
  return arr.some((x) => typeof x === "string" && /Event$/.test(x));
}

function* walk(node: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(node)) for (const n of node) yield* walk(n);
  else if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    yield o;
    if (o["@graph"]) yield* walk(o["@graph"]);
    if (o.itemListElement) yield* walk(o.itemListElement);
    if (o.item) yield* walk(o.item);
  }
}

function toEvent(o: Record<string, unknown>): JsonLdEvent | null {
  const name = str(o.name);
  if (!name) return null;
  const loc = first(o.location as Record<string, unknown> | Record<string, unknown>[] | undefined);
  const addr = loc?.address as Record<string, unknown> | string | undefined;
  const geo = loc?.geo as Record<string, unknown> | undefined;
  const offer = first(o.offers as Record<string, unknown> | Record<string, unknown>[] | undefined);
  const img = first(o.image as unknown);
  const org = first(o.organizer as unknown);
  const price = offer?.price !== undefined ? Number(offer.price) : undefined;
  return {
    name,
    description: str(o.description),
    startDate: str(o.startDate),
    endDate: str(o.endDate),
    url: str(o.url),
    image: typeof img === "string" ? img : str((img as Record<string, unknown> | undefined)?.url),
    locationName: str(loc?.name),
    locationAddress: typeof addr === "string" ? addr : str(addr?.streetAddress),
    city: typeof addr === "object" ? str(addr?.addressLocality) : undefined,
    lat: geo?.latitude !== undefined ? Number(geo.latitude) : undefined,
    lng: geo?.longitude !== undefined ? Number(geo.longitude) : undefined,
    organizer: typeof org === "string" ? org : str((org as Record<string, unknown> | undefined)?.name),
    price: price !== undefined && Number.isFinite(price) ? price : undefined,
    priceCurrency: str(offer?.priceCurrency),
    free: price === 0 ? true : undefined,
  };
}

/** Lee metadatos OpenGraph, JSON-LD (schema.org/Event), feeds y texto visible de un HTML. Sin ejecutar JS. */
export function parseHtml(html: string, baseUrl?: string): PageMeta {
  const $ = cheerio.load(html);
  const meta = (k: string) => str($(`meta[property="${k}"], meta[name="${k}"]`).first().attr("content"));
  const abs = (u?: string) => {
    if (!u) return undefined;
    try {
      return new URL(u, baseUrl).toString();
    } catch {
      return undefined;
    }
  };

  const jsonLdEvents: JsonLdEvent[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).contents().text());
      for (const o of walk(data)) {
        if (typeIsEvent(o["@type"])) {
          const e = toEvent(o);
          if (e) jsonLdEvents.push({ ...e, url: abs(e.url), image: abs(e.image) });
        }
      }
    } catch {
      /* JSON-LD inválido: se ignora */
    }
  });

  const feeds = $('link[rel="alternate"][type*="rss"], link[rel="alternate"][type*="atom"]')
    .map((_, el) => abs($(el).attr("href")))
    .get()
    .filter(Boolean) as string[];
  const links = $("a[href]").map((_, el) => abs($(el).attr("href"))).get().filter(Boolean) as string[];

  $("script, style, noscript, nav, footer, svg").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 20_000);

  return {
    title: meta("og:title") ?? str($("title").first().text()),
    description: meta("og:description") ?? meta("description"),
    image: abs(meta("og:image")),
    url: abs(meta("og:url")),
    siteName: meta("og:site_name"),
    publishedAt: meta("article:published_time"),
    text,
    jsonLdEvents,
    feeds,
    links,
  };
}
