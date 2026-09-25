"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { ApiFailure, adminFetch, attempt, flashHref } from "@/lib/admin";

async function me() {
  const s = await auth();
  if (!s?.user?.id) redirect("/login?callbackUrl=/my");
  return s.user.id;
}
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const url = (f: FormData, k: string) => str(f, k) || null;

function done(r: { msg: string; kind: string }): never {
  revalidatePath("/my");
  revalidatePath("/");
  redirect(flashHref("/my", r));
}

export async function createMySourceAction(f: FormData) {
  const uid = await me();
  const body = {
    name: str(f, "name"),
    city: str(f, "city") || null,
    type: str(f, "type") || "tour-operator",
    urls: { website: url(f, "website"), facebook: url(f, "facebook"), instagram: url(f, "instagram"), tiktok: null, rss: url(f, "rss") },
  };
  done(await attempt(() => adminFetch(uid, "/my/sources", { method: "POST", body: JSON.stringify(body) }), `“${body.name}” agregada a tus fuentes`));
}

export async function checkMySourceAction(f: FormData) {
  const uid = await me();
  const id = str(f, "id");
  let msg = "";
  const r = await attempt(async () => {
    const c = await adminFetch<{ status: string; message: string; newEvents: number }>(uid, `/my/sources/${id}/check`, { method: "POST" });
    msg = c.status === "AUTH_REQUIRED"
      ? "Facebook e Instagram todavía no se pueden leer sin una conexión de Meta autorizada. Prueba con el sitio web o el feed RSS de la fuente."
      : `${c.newEvents} evento(s) nuevo(s). ${c.message}`.slice(0, 300);
  }, "");
  done(r.kind === "ok" ? { msg, kind: "ok" } : r);
}

export async function toggleMySourceAction(f: FormData) {
  const uid = await me();
  const active = str(f, "active") === "true";
  done(await attempt(() => adminFetch(uid, `/my/sources/${str(f, "id")}`, { method: "PATCH", body: JSON.stringify({ active }) }), active ? "Fuente reactivada" : "Fuente en pausa"));
}

export async function deleteMySourceAction(f: FormData) {
  const uid = await me();
  done(await attempt(() => adminFetch(uid, `/my/sources/${str(f, "id")}`, { method: "DELETE" }), "Fuente eliminada junto con sus eventos privados"));
}

export async function subscribeAction(f: FormData) {
  const uid = await me();
  const id = str(f, "id");
  const on = str(f, "on") === "true";
  done(await attempt(async () => {
    if (on) await adminFetch(uid, `/my/subscriptions/${id}`, { method: "PUT", body: "{}" });
    else await adminFetch(uid, `/my/subscriptions/${id}`, { method: "DELETE" }).catch((e) => { if (!(e instanceof ApiFailure && e.status === 404)) throw e; });
  }, on ? "Fuente añadida a tu agenda" : "Fuente quitada de tu agenda"));
}

export async function saveScheduleAction(f: FormData) {
  const uid = await me();
  const [h, m] = str(f, "time").split(":").map(Number);
  const body = {
    enabled: f.get("enabled") === "on",
    days: f.getAll("days").map((d) => Number(d)),
    hour: h ?? 5,
    minute: m ?? 15,
    timezone: str(f, "timezone") || undefined,
  };
  done(await attempt(() => adminFetch(uid, "/my/schedule", { method: "PUT", body: JSON.stringify(body) }), body.enabled ? "Horario guardado" : "Revisión automática desactivada"));
}

export async function markReadAction() {
  const uid = await me();
  await adminFetch(uid, "/my/notifications/read", { method: "POST" }).catch(() => {});
  revalidatePath("/my");
  redirect("/my");
}
