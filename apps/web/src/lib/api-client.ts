import type { EventItem, EventQuery } from "@turistero/types";
import { auth } from "@/auth";
import { apiAs, apiConfigured } from "./session-api";

/** Cliente tipado de la API Express. Solo se usa en servidor (Server Components). */
export const apiEnabled = () => !!process.env.API_URL;

/**
 * Lecturas públicas: cacheadas 60 s. Con sesión iniciada NO se cachean ni se comparten: el usuario
 * también ve sus eventos privados (fuentes propias) y su agenda personal.
 */
async function get<T>(path: string, revalidate = 60, anonymous = false): Promise<T | null> {
  const uid = apiConfigured() && !anonymous ? (await auth())?.user?.id : undefined;
  const res = uid
    ? await apiAs(uid, path)
    : await fetch(`${process.env.API_URL}/api${path}`, { next: { revalidate } });
  if (res.status === 401 && uid) return get<T>(path, revalidate, true); // sesión que la API ya no reconoce: se lee como anónimo
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${res.status} en ${path}`);
  return (await res.json()) as T;
}

export async function apiQueryEvents(q: EventQuery): Promise<EventItem[]> {
  const sp = new URLSearchParams();
  const set = (k: string, v?: string | number) => v !== undefined && v !== "" && sp.set(k, String(v));
  set("country", q.country);
  set("city", q.placeId);
  set("category", q.category);
  set("range", q.range);
  set("from", q.from);
  set("to", q.to);
  set("price", q.price);
  set("sort", q.sort);
  set("q", q.q);
  if (q.mine) sp.set("mine", "true");
  set("pageSize", Math.min(q.limit ?? 100, 100));
  const page = await get<{ items: EventItem[] }>(`/events?${sp}`);
  return page?.items ?? [];
}

export async function apiGetEvent(slug: string): Promise<EventItem | undefined> {
  return (await get<EventItem>(`/events/${encodeURIComponent(slug)}`)) ?? undefined;
}
