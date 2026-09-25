import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { apiAs, apiConfigured } from "./session-api";

export type Role = "USER" | "EDITOR" | "ADMIN";
const RANK: Record<Role, number> = { USER: 1, EDITOR: 2, ADMIN: 3 };

/** Guard para páginas y server actions (las acciones son endpoints públicos: siempre se revalida). La API vuelve a comprobar el rol. */
export async function requireRole(min: "EDITOR" | "ADMIN") {
  const s = await auth();
  if (!s?.user?.id) redirect("/login?callbackUrl=/admin");
  if (RANK[s.user.role] < RANK[min]) redirect("/?error=forbidden");
  return { id: s.user.id, role: s.user.role, name: s.user.name ?? "" };
}

export class ApiFailure extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function adminFetch<T>(uid: string, path: string, init: RequestInit = {}): Promise<T> {
  if (!apiConfigured()) throw new ApiFailure(503, "NOT_CONFIGURED", "Falta API_URL / API_JWT_SECRET");
  const res = await apiAs(uid, path, init);
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string; details?: { path: string; message: string }[] } };
  if (res.status === 401) redirect("/auth/expired");
  if (!res.ok) {
    const d = json.error?.details?.map((x) => `${x.path}: ${x.message}`).join("; ");
    throw new ApiFailure(res.status, json.error?.code ?? "ERROR", [json.error?.message, d].filter(Boolean).join(" — ") || `HTTP ${res.status}`);
  }
  return json as T;
}

/** Ejecuta una mutación y devuelve un mensaje para mostrar tras redirigir. */
export async function attempt(fn: () => Promise<unknown>, ok: string): Promise<{ msg: string; kind: "ok" | "error" }> {
  try {
    await fn();
    return { msg: ok, kind: "ok" };
  } catch (e) {
    return { msg: e instanceof ApiFailure ? e.message : "Error inesperado", kind: "error" };
  }
}

export const flashHref = (path: string, r: { msg: string; kind: string }) => `${path}${path.includes("?") ? "&" : "?"}${r.kind}=${encodeURIComponent(r.msg)}`;

export interface Page<T> { items: T[]; page: number; pageSize: number; total: number }
export interface SourceDto {
  id: string; name: string; aliases: string[]; type: string; country: string; city: string | null; categories: string[]; active: boolean; priority: number;
  urls: { website: string | null; facebook: string | null; instagram: string | null; tiktok: string | null; rss?: string | null };
  verification: Record<string, string>; lastReviewedAt: string | null; notes: string;
}
export interface CheckDto { id: string; sourceId: string; runId: string | null; startedAt: string; finishedAt: string | null; status: string; postsReviewed: number; eventsFound: number; message: string }
export interface StatusRow { source: SourceDto; lastCheck: CheckDto | null; failureStreak: number }
