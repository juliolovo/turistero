"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { zonedTimeToUtc } from "@turistero/config";
import { ApiFailure, adminFetch, attempt, flashHref, requireRole } from "@/lib/admin";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const url = (f: FormData, k: string) => str(f, k) || null;

function done(path: string, r: { msg: string; kind: string }): never {
  revalidatePath("/admin", "layout");
  redirect(flashHref(path, r));
}

/* ---------- fuentes ---------- */
export async function createSourceAction(f: FormData) {
  const u = await requireRole("EDITOR");
  const body = {
    id: str(f, "id"), name: str(f, "name"), type: str(f, "type") || "venue", city: str(f, "city") || null,
    aliases: str(f, "aliases").split(",").map((s) => s.trim()).filter(Boolean),
    categories: f.getAll("categories").map(String),
    priority: Number(str(f, "priority") || 10),
    urls: { website: url(f, "website"), facebook: url(f, "facebook"), instagram: url(f, "instagram"), tiktok: null, rss: url(f, "rss") },
    notes: str(f, "notes"),
  };
  done("/admin/sources", await attempt(() => adminFetch(u.id, "/sources", { method: "POST", body: JSON.stringify(body) }), `Fuente “${body.name}” creada`));
}

export async function updateSourceAction(f: FormData) {
  const u = await requireRole("EDITOR");
  const id = str(f, "id");
  const body = {
    name: str(f, "name"), type: str(f, "type"), city: str(f, "city") || null,
    aliases: str(f, "aliases").split(",").map((s) => s.trim()).filter(Boolean),
    categories: f.getAll("categories").map(String),
    priority: Number(str(f, "priority") || 10),
    active: f.get("active") === "on",
    urls: { website: url(f, "website"), facebook: url(f, "facebook"), instagram: url(f, "instagram"), tiktok: null, rss: url(f, "rss") },
    notes: str(f, "notes"),
  };
  done(`/admin/sources/${id}`, await attempt(() => adminFetch(u.id, `/sources/${id}`, { method: "PATCH", body: JSON.stringify(body) }), "Fuente actualizada"));
}

export async function toggleSourceAction(f: FormData) {
  const u = await requireRole("EDITOR");
  const id = str(f, "id");
  const active = str(f, "active") === "true";
  done("/admin/sources", await attempt(() => adminFetch(u.id, `/sources/${id}`, { method: "PATCH", body: JSON.stringify({ active }) }), active ? "Fuente activada" : "Fuente desactivada"));
}

export async function checkSourceAction(f: FormData) {
  const u = await requireRole("EDITOR");
  const id = str(f, "id");
  const back = str(f, "back") || "/admin/sources";
  let msg = "";
  const r = await attempt(async () => {
    const c = await adminFetch<{ status: string; message: string }>(u.id, `/sources/${id}/check`, { method: "POST" });
    msg = `Revisión de ${id}: ${c.status} — ${c.message}`.slice(0, 300);
  }, "");
  done(back, r.kind === "ok" ? { msg, kind: "ok" } : r);
}

export async function deleteSourceAction(f: FormData) {
  const u = await requireRole("ADMIN");
  const id = str(f, "id");
  done("/admin/sources", await attempt(() => adminFetch(u.id, `/sources/${id}`, { method: "DELETE" }), `Fuente ${id} eliminada`));
}

export async function importSourcesAction(f: FormData) {
  const u = await requireRole("ADMIN");
  const r = await attempt(async () => {
    const file = f.get("file");
    const text = file instanceof File && file.size ? await file.text() : str(f, "json");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw Object.assign(new Error("JSON inválido"), { status: 400 });
    }
    const mode = str(f, "mode") === "replace-matching" ? "replace-matching" : "merge";
    const out = await adminFetch<{ created: number; updated: number; skipped: number }>(u.id, "/sources/import", { method: "POST", body: JSON.stringify({ mode, file: parsed }) });
    return out;
  }, "Importación completada");
  done("/admin/sources", r);
}

/* ---------- corridas ---------- */
export async function runNowAction() {
  const u = await requireRole("EDITOR");
  let msg = "";
  const r = await attempt(async () => {
    const run = await adminFetch<{ sourcesChecked: number; eventsFound: number; newEvents: number; errors: number }>(u.id, "/discovery-runs", { method: "POST", body: "{}" });
    msg = `Búsqueda terminada: ${run.sourcesChecked} fuentes, ${run.eventsFound} eventos detectados, ${run.newEvents} nuevos, ${run.errors} errores`;
  }, "");
  done("/admin/runs", r.kind === "ok" ? { msg, kind: "ok" } : r);
}

/* ---------- eventos ---------- */
export async function eventStatusAction(f: FormData) {
  const u = await requireRole("EDITOR");
  const id = str(f, "id");
  const status = str(f, "status");
  const back = str(f, "back") || "/admin/events";
  done(back, await attempt(() => adminFetch(u.id, `/events/${id}`, { method: "PATCH", body: JSON.stringify({ status, ...(status === "PUBLISHED" ? { confidence: str(f, "confidence") === "LOW" ? "MEDIUM" : undefined } : {}) }) }), status === "PUBLISHED" ? "Evento aprobado" : "Evento ocultado"));
}

export async function updateEventAction(f: FormData) {
  const u = await requireRole("EDITOR");
  const id = str(f, "id");
  const tz = str(f, "timezone") || "America/Managua";
  const [d, t] = str(f, "start").split("T");
  const [y, m, day] = (d ?? "").split("-").map(Number);
  const [h, mi] = (t ?? "0:0").split(":").map(Number);
  const body = {
    title: str(f, "title"), description: str(f, "description"), category: str(f, "category"), venue: str(f, "venue"),
    address: str(f, "address") || null, confidence: str(f, "confidence"),
    ...(y && m && day ? { startsAt: zonedTimeToUtc(y, m, day, h ?? 0, mi ?? 0, tz).toISOString() } : {}),
  };
  done(`/admin/events/${id}`, await attempt(() => adminFetch(u.id, `/events/${id}`, { method: "PATCH", body: JSON.stringify(body) }), "Evento actualizado"));
}

export async function mergeEventAction(f: FormData) {
  const u = await requireRole("EDITOR");
  const id = str(f, "id");
  const intoId = str(f, "intoId");
  done("/admin/events", await attempt(() => adminFetch(u.id, `/events/${id}/merge`, { method: "POST", body: JSON.stringify({ intoId }) }), "Eventos fusionados: se conservaron todas las fuentes"));
}

export async function addEventAction(f: FormData) {
  const u = await requireRole("EDITOR");
  const body = { url: str(f, "url") || undefined, text: str(f, "text") || undefined, organizer: str(f, "organizer") || undefined, city: str(f, "city") || undefined, publish: f.get("publish") === "on" };
  let msg = "";
  const r = await attempt(async () => {
    const out = await adminFetch<{ items: { title: string; created: boolean; confidence: string; status: string }[] }>(u.id, "/events/from-source-content", { method: "POST", body: JSON.stringify(body) });
    msg = out.items.map((i) => `${i.created ? "Creado" : "Ya existía (fuente añadida)"}: ${i.title} [${i.confidence}, ${i.status}]`).join(" · ");
  }, "");
  done("/admin/add-event", r.kind === "ok" ? { msg, kind: "ok" } : r);
}

/* ---------- candidatos ---------- */
export async function candidateAction(f: FormData) {
  const u = await requireRole("EDITOR");
  const id = str(f, "id");
  const action = str(f, "action");
  const body = action === "merge" ? { action, intoSourceId: str(f, "intoSourceId") } : { action };
  done("/admin/candidates", await attempt(() => adminFetch(u.id, `/source-candidates/${id}`, { method: "POST", body: JSON.stringify(body) }), action === "approve" ? "Candidato aprobado: ya es una fuente del catálogo" : action === "reject" ? "Candidato rechazado" : "Candidato fusionado"));
}

/* ---------- usuarios y conexiones (solo ADMIN) ---------- */
export async function userRoleAction(f: FormData) {
  const u = await requireRole("ADMIN");
  const id = str(f, "id");
  done("/admin/users", await attempt(() => adminFetch(u.id, `/users/${id}`, { method: "PATCH", body: JSON.stringify({ role: str(f, "role") }) }), "Rol actualizado"));
}

export async function createConnectionAction(f: FormData) {
  const u = await requireRole("ADMIN");
  const body = { provider: str(f, "provider"), externalId: str(f, "externalId"), token: str(f, "token"), label: str(f, "label") || undefined };
  done("/admin/connections", await attempt(() => adminFetch(u.id, "/connections", { method: "POST", body: JSON.stringify(body) }), "Conexión guardada (token cifrado)"));
}

export async function deleteConnectionAction(f: FormData) {
  const u = await requireRole("ADMIN");
  done("/admin/connections", await attempt(() => adminFetch(u.id, `/connections/${str(f, "id")}`, { method: "DELETE" }), "Conexión eliminada"));
}

export async function testConnectionAction(f: FormData) {
  const u = await requireRole("ADMIN");
  let msg = "";
  const r = await attempt(async () => {
    const t = await adminFetch<{ valid: boolean; message: string; scopes: string[]; expiresAt: string | null }>(u.id, `/meta/connections/${str(f, "id")}/test`, { method: "POST" });
    msg = t.valid ? `✅ ${t.message} Permisos: ${t.scopes.join(", ") || "—"}.` : `⚠ ${t.message}`;
    if (!t.valid) throw new ApiFailure(200, "INVALID", msg);
  }, "");
  done("/admin/connections", r.kind === "ok" ? { msg, kind: "ok" } : r);
}
