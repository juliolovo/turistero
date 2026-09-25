import { cache } from "react";
import type { EventItem } from "@turistero/types";
import { auth } from "@/auth";
import { apiAs, apiConfigured } from "./session-api";

export type FavoriteState = { enabled: false } | { enabled: true; userId: string | null; ids: Set<string> };

/** Estado de favoritos del visitante actual (una sola consulta por render). */
export const getFavoriteState = cache(async (): Promise<FavoriteState> => {
  if (!apiConfigured()) return { enabled: false };
  const uid = (await auth())?.user?.id;
  if (!uid) return { enabled: true, userId: null, ids: new Set() };
  const res = await apiAs(uid, "/favorites?pageSize=100");
  if (res.status === 401) return { enabled: true, userId: null, ids: new Set() }; // sesión que la API ya no reconoce
  if (!res.ok) return { enabled: true, userId: uid, ids: new Set() };
  const page = (await res.json()) as { items: EventItem[] };
  return { enabled: true, userId: uid, ids: new Set(page.items.map((e) => e.id)) };
});

export async function getFavoriteEvents(uid: string): Promise<EventItem[]> {
  const res = await apiAs(uid, "/favorites?pageSize=100");
  if (!res.ok) throw new Error(`API ${res.status} en /favorites`);
  return ((await res.json()) as { items: EventItem[] }).items;
}
