import { cache } from "react";
import type { EventItem, EventQuery } from "@turistero/types";
import { getPlace, resolveRange, DEFAULT_COUNTRY, getCategory } from "@turistero/config";
import { buildMockEvents } from "@turistero/mocks";
import { apiEnabled, apiGetEvent, apiQueryEvents } from "./api-client";

/**
 * Repositorio de eventos. Con API_URL usa la API Express (Postgres); sin ella, datos de ejemplo en memoria
 * (útil para desarrollo del frontend y previews sin backend).
 */
const loadAll = cache(async (): Promise<EventItem[]> => buildMockEvents(new Date()));

function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function haystack(e: EventItem) {
  const place = getPlace(e.placeId)?.name ?? "";
  return normalize(
    [e.title, e.description, e.venue, e.organizer?.name, place, getCategory(e.category).label, e.sources.map((s) => s.sourceName).join(" ")].join(" "),
  );
}

const mockQuery = async (q: EventQuery): Promise<EventItem[]> => {
  const all = await loadAll();
  const now = new Date();
  const country = q.country ?? DEFAULT_COUNTRY;
  const tz = (q.placeId && getPlace(q.placeId)?.timezone) || all.find((e) => e.country === country)?.timezone || "UTC";
  const range = resolveRange(q.range ?? "week", now, tz, { from: q.from, to: q.to });
  const terms = q.q ? normalize(q.q).split(/\s+/).filter(Boolean) : [];

  let list = all.filter((e) => {
    if (e.status !== "PUBLISHED" || e.confidence === "LOW") return false;
    if (e.country !== country) return false;
    if (q.placeId && e.placeId !== q.placeId) return false;
    if (q.category && e.category !== q.category) return false;
    if (q.price === "free" && !e.price.isFree) return false;
    if (q.price === "paid" && e.price.isFree) return false;
    const t = new Date(e.startsAt);
    if (t < range.from || t >= range.to) return false;
    if (terms.length && !terms.every((w) => haystack(e).includes(w))) return false;
    return true;
  });

  const sort = q.sort ?? "date";
  if (sort === "new") list.sort((a, b) => +new Date(b.discoveredAt) - +new Date(a.discoveredAt));
  else if (sort === "relevance" && terms.length) {
    const score = (e: EventItem) => terms.reduce((n, w) => n + (normalize(e.title).includes(w) ? 3 : 0) + (haystack(e).includes(w) ? 1 : 0), 0);
    list.sort((a, b) => score(b) - score(a) || +new Date(a.startsAt) - +new Date(b.startsAt));
  } else list.sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));

  return q.limit ? list.slice(0, q.limit) : list;
};

export const queryEvents = cache(async (q: EventQuery = {}): Promise<EventItem[]> =>
  apiEnabled() ? apiQueryEvents(q) : mockQuery(q),
);

export const getEventBySlug = cache(async (slug: string): Promise<EventItem | undefined> => {
  if (apiEnabled()) return apiGetEvent(slug);
  const all = await loadAll();
  return all.find((e) => e.slug === slug && e.status === "PUBLISHED");
});

export async function getRelatedEvents(e: EventItem, limit = 3): Promise<EventItem[]> {
  const all = apiEnabled() ? await apiQueryEvents({ range: "custom", from: new Date().toISOString().slice(0, 10), to: "2099-12-31", limit: 100 }) : await loadAll();
  const now = Date.now();
  return all
    .filter((x) => x.id !== e.id && x.status === "PUBLISHED" && +new Date(x.startsAt) >= now)
    .map((x) => ({ x, s: (x.category === e.category ? 2 : 0) + (x.placeId === e.placeId ? 1 : 0) }))
    .filter(({ s }) => s > 0)
    .sort((a, b) => b.s - a.s || +new Date(a.x.startsAt) - +new Date(b.x.startsAt))
    .slice(0, limit)
    .map(({ x }) => x);
}

export async function getAllSlugs(): Promise<string[]> {
  if (apiEnabled()) return (await apiQueryEvents({ limit: 100 })).map((e) => e.slug);
  return (await loadAll()).map((e) => e.slug);
}
