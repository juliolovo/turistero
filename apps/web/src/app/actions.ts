"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { apiAs, apiConfigured } from "@/lib/session-api";

/** Añade o quita un favorito. El usuario sale SIEMPRE de la sesión, nunca de un parámetro del cliente. */
export async function setFavorite(eventId: string, on: boolean): Promise<{ ok: boolean; reason?: "auth" | "error" }> {
  const uid = (await auth())?.user?.id;
  if (!uid) return { ok: false, reason: "auth" };
  if (!apiConfigured() || typeof eventId !== "string" || eventId.length > 100) return { ok: false, reason: "error" };
  const res = await apiAs(uid, `/favorites/${encodeURIComponent(eventId)}`, { method: on ? "POST" : "DELETE" });
  if (!res.ok) return { ok: false, reason: "error" };
  revalidatePath("/favorites");
  return { ok: true };
}
