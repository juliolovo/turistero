import { timingSafeEqual } from "node:crypto";
import express, { Router } from "express";
import cors from "cors";
import { z } from "zod";
import { and, eq, gte, inArray } from "drizzle-orm";
import { slugify } from "@turistero/event-parser";
import helmet from "helmet";
import { pino, type Logger } from "pino";
import { pinoHttp } from "pino-http";
import type { Db } from "@turistero/db";
import {
  deleteConnection, listConnections, saveConnection, actOnCandidate, addFavorite, createSavedFilter, deleteSavedFilter, getUser, listSavedFilters, listUsers, setRole, syncUser, createCandidate, createSource, deleteSource, exportSources, getEvent, getSourceRow, importSources,
  failureStreaks, latestChecks, mergeEvents, checkDecision, getSchedule, setSchedule, listNotifications, markAllRead, unreadCount, registerPasswordUser, verifyLogin, sourceChecks, sources as sourcesTable, createPrivateSource, deletePrivateSource, getOwnedSource, listMySources, mySourceIds, patchPrivateSource, removeSubscription, setSubscription, MAX_PRIVATE_SOURCES, listCandidates, listChecks, listEvents, listFavorites, listRuns, listSources, patchSource, removeFavorite, rowToSource, updateEvent,
} from "@turistero/db";
import {
  candidateActionSchema, candidateCreateSchema, eventPatchSchema, eventQuerySchema, favoriteListQuerySchema, importSourcesSchema,
  paginationSchema, runCreateSchema, scheduleSchema, registerSchema, loginSchema, mySourceCreateSchema, mySourcePatchSchema, subscriptionSchema, connectionCreateSchema, eventFromSchema, savedFilterCreateSchema, userRolePatchSchema, userSyncSchema, sourceCreateSchema, sourceListQuerySchema, sourcePatchSchema,
} from "@turistero/schemas";
import { CATEGORIES, COUNTRIES, PLACES, FREE_EMOJI, NEW_EMOJI } from "@turistero/config";
import { authenticate, requireRole, requireService } from "./auth";
import { checkOne, candidatesFromContents, isScanning, persistCandidate, runDiscovery, type DiscoveryDeps } from "./discovery";
import { runScheduledTick } from "./tick";
import { registerMetaCallbacks } from "./meta-callbacks";
import { contentFromText, contentFromUrl, createSafeFetcher, type SafeFetcher, type SourceAdapter } from "@turistero/discovery";
import { HttpError, errorHandler, notFound, notFoundHandler } from "./http";

export interface AppOptions {
  db: Db;
  logger?: Logger;
  serviceToken?: string;
  jwtSecret?: string;
  fetcher?: SafeFetcher;
  adapters?: SourceAdapter[];
  now?: () => Date;
  adminEmails?: string[];
  allowDevAuth?: boolean;
  corsOrigins?: string[];
}

const p = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0]! : (v ?? ""));

export function createApp({ db, logger, serviceToken, jwtSecret, adminEmails = [], allowDevAuth = false, corsOrigins, fetcher, adapters, now }: AppOptions) {
  const log = logger ?? pino({ level: process.env.LOG_LEVEL ?? "info" });
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: corsOrigins?.length ? corsOrigins : false }));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "10kb" })); // callbacks de Meta (signed_request)
  app.use(pinoHttp({ logger: log, autoLogging: { ignore: (r) => r.url === "/health" } }));
  app.use(authenticate(db, { serviceToken, jwtSecret, allowDev: allowDevAuth }));

  const deps: DiscoveryDeps = { db, fetcher: fetcher ?? createSafeFetcher(), adapters, now };
  const api = Router();
  const editor = requireRole("EDITOR");
  const admin = requireRole("ADMIN");
  const user = requireRole("USER");
  const isStaff = (role?: string) => role === "EDITOR" || role === "ADMIN";

  api.get("/categories", (_req, res) => {
    res.json({ items: CATEGORIES, badges: { free: FREE_EMOJI, new: NEW_EMOJI } });
  });
  api.get("/places", (_req, res) => res.json({ items: PLACES, countries: COUNTRIES }));

  /* ---------- eventos ---------- */
  api.get("/events", async (req, res) => {
    const q = eventQuerySchema.parse(req.query);
    const staff = isStaff(req.user?.role);
    const viewerId = req.user && req.user.id !== "service" ? req.user.id : undefined;
    if (q.mine === "true" && !viewerId) throw new HttpError(401, "UNAUTHENTICATED", "Inicia sesión para ver tu agenda");
    const mineSourceIds = q.mine === "true" ? await mySourceIds(db, viewerId!) : undefined;
    res.json(await listEvents(db, q, { includeAll: staff && q.mine !== "true", viewerId, mineSourceIds }));
  });
  api.get("/events/:id", async (req, res) => {
    const e = await getEvent(db, p(req.params.id), { includeAll: isStaff(req.user?.role), viewerId: req.user && req.user.id !== "service" ? req.user.id : undefined });
    if (!e) throw notFound("Evento");
    res.json(e);
  });
  api.patch("/events/:id", editor, async (req, res) => {
    const patch = eventPatchSchema.parse(req.body);
    const e = await updateEvent(db, p(req.params.id), patch);
    if (!e) throw notFound("Evento");
    res.json(e);
  });

  api.post("/events/:id/merge", editor, async (req, res) => {
    const { intoId } = z.object({ intoId: z.string().min(1) }).parse(req.body);
    const r = await mergeEvents(db, p(req.params.id), intoId);
    if (r === "not-found") throw notFound("Evento");
    if (r === "same") throw new HttpError(400, "SAME_EVENT", "No se puede fusionar un evento consigo mismo");
    res.json(r);
  });

  /* ---------- alta manual de eventos (URL o texto pegado) ---------- */
  api.post("/events/from-source-content", editor, async (req, res) => {
    const body = eventFromSchema.parse(req.body);
    const now = (deps.now ?? (() => new Date()))();
    const label = body.url ? new URL(body.url).hostname : "Entrada manual";
    const sid = `manual-${slugify(body.organizer ?? label)}`; // una fuente distinta por organizador/host: así no se pierden fuentes alternativas
    let contents;
    if (body.url) {
      const r = await contentFromUrl(deps.fetcher!, sid, body.url);
      if (r.error) throw new HttpError(422, r.error.status, `No se pudo leer la URL: ${r.error.message}`);
      contents = r.contents;
    } else {
      contents = [contentFromText(sid, body.text!, null)];
    }
    const cands = candidatesFromContents(contents, { type: "organizer", name: body.organizer ?? label, city: body.city ?? null }, now);
    if (!cands.length) throw new HttpError(422, "NO_EVENT_FOUND", "No se encontró una fecha reconocible: no se creó ningún evento.");
    const out = [];
    for (const c of cands) {
      // Un editor puede publicar aunque la confianza sea LOW (asume la responsabilidad).
      const r = await persistCandidate(db, c, { sourceName: body.organizer ?? label, publishLow: body.publish });
      out.push({ ...r, title: c.title, confidence: c.confidence, reasons: c.reasons });
    }
    res.status(201).json({ items: out });
  });

  /* ---------- conexiones a Meta (tokens cifrados) ---------- */
  api.get("/connections", admin, async (req, res) => res.json({ items: await listConnections(db, req.user!.id) }));
  api.post("/connections", admin, async (req, res) => {
    const c = connectionCreateSchema.parse(req.body);
    if (!process.env.TOKEN_ENCRYPTION_KEY) throw new HttpError(503, "NOT_CONFIGURED", "Falta TOKEN_ENCRYPTION_KEY: no se guardan tokens sin cifrado.");
    res.status(201).json(await saveConnection(db, { userId: req.user!.id === "service" ? "service" : req.user!.id, ...c, expiresAt: c.expiresAt ? new Date(c.expiresAt) : null }));
  });
  api.delete("/connections/:id", admin, async (req, res) => {
    if (!(await deleteConnection(db, req.user!.id, p(req.params.id)))) throw notFound("Conexión");
    res.status(204).end();
  });

  /* ---------- fuentes ---------- */
  api.get("/sources", async (req, res) => {
    const q = sourceListQuerySchema.parse(req.query);
    res.json(await listSources(db, { ...q, active: q.active === undefined ? undefined : q.active === "true" }));
  });
  api.get("/sources/export", editor, async (_req, res) => {
    res.setHeader("Content-Disposition", 'attachment; filename="sources.json"');
    res.json(await exportSources(db));
  });
  api.post("/sources/import", admin, async (req, res) => {
    const { mode, file } = importSourcesSchema.parse(req.body);
    res.json(await importSources(db, file, mode));
  });
  api.get("/sources/status", editor, async (_req, res) => {
    const [all, checks, streaks] = await Promise.all([listSources(db, { page: 1, pageSize: 500 }), latestChecks(db), failureStreaks(db)]);
    const byId = new Map(checks.map((c) => [c.sourceId, c]));
    res.json({ items: all.items.map((s) => ({ source: s, lastCheck: byId.get(s.id) ?? null, failureStreak: streaks[s.id] ?? 0 })) });
  });
  api.post("/sources", editor, async (req, res) => {
    const created = await createSource(db, sourceCreateSchema.parse(req.body));
    if (created === "exists") throw new HttpError(409, "CONFLICT", "Ya existe una fuente con ese id");
    res.status(201).json(created);
  });
  // Las fuentes privadas de usuarios no existen para estas rutas (catálogo global): 404 aunque se conozca el id.
  const globalSource = async (id: string) => {
    const s = await getSourceRow(db, id);
    if (!s || s.ownerId) throw notFound("Fuente");
    return s;
  };
  api.get("/sources/:id", async (req, res) => {
    const s = await globalSource(p(req.params.id));
    res.json(rowToSource(s));
  });
  api.patch("/sources/:id", editor, async (req, res) => {
    await globalSource(p(req.params.id));
    const s = await patchSource(db, p(req.params.id), sourcePatchSchema.parse(req.body));
    if (!s) throw notFound("Fuente");
    res.json(s);
  });
  api.delete("/sources/:id", admin, async (req, res) => {
    await globalSource(p(req.params.id));
    if (!(await deleteSource(db, p(req.params.id)))) throw notFound("Fuente");
    res.status(204).end();
  });
  api.post("/sources/:id/check", editor, async (req, res) => {
    const s = await globalSource(p(req.params.id));
    res.status(201).json((await checkOne(deps, s)).check);
  });
  api.get("/sources/:id/checks", editor, async (req, res) => {
    const { page, pageSize } = paginationSchema.parse(req.query);
    await globalSource(p(req.params.id));
    res.json(await listChecks(db, p(req.params.id), page, pageSize));
  });

  /* ---------- candidatos ---------- */
  api.get("/source-candidates", editor, async (req, res) => {
    const { page, pageSize } = paginationSchema.parse(req.query);
    const status = ["PENDING", "APPROVED", "REJECTED", "MERGED"].find((s) => s === req.query.status) as "PENDING" | undefined;
    res.json(await listCandidates(db, page, pageSize, status));
  });
  api.post("/source-candidates", editor, async (req, res) => {
    const c = candidateCreateSchema.parse(req.body);
    res.status(201).json(await createCandidate(db, c));
  });
  api.post("/source-candidates/:id", editor, async (req, res) => {
    const a = candidateActionSchema.parse(req.body);
    const source = a.action === "approve" ? (a.source ? sourceCreateSchema.parse({ ...a.source, id: a.source.id ?? "pendiente" }) : undefined) : undefined;
    const r = await actOnCandidate(db, p(req.params.id), a.action === "approve" ? { action: "approve", source } : a, req.user?.id);
    if (r === "not-found") throw notFound("Candidato");
    if (r === "conflict") throw new HttpError(409, "CONFLICT", "El candidato ya fue resuelto o la fuente ya existe");
    if (r === "target-missing") throw new HttpError(422, "TARGET_MISSING", "La fuente destino no existe");
    res.json(r);
  });

  /* ---------- agenda personal: fuentes propias y suscripciones ---------- */
  api.get("/my/sources", user, async (req, res) => {
    const mine = await listMySources(db, req.user!.id);
    const ids = mine.private.map((s) => s.id);
    const now = (deps.now ?? (() => new Date()))();
    const checks = ids.length
      ? await db.select({ sourceId: sourceChecks.sourceId, startedAt: sourceChecks.startedAt, status: sourceChecks.status, message: sourceChecks.message })
          .from(sourceChecks).where(and(inArray(sourceChecks.sourceId, ids), gte(sourceChecks.startedAt, new Date(now.getTime() - 48 * 3_600_000))))
      : [];
    const rows = ids.length ? await db.select({ id: sourcesTable.id, scanningSince: sourcesTable.scanningSince }).from(sourcesTable).where(inArray(sourcesTable.id, ids)) : [];
    const scanning = new Map(rows.map((r) => [r.id, isScanning(r, now)]));
    const priv = mine.private.map((s) => {
      const mine = checks.filter((c) => c.sourceId === s.id);
      const d = checkDecision(mine, now);
      const last = [...mine].sort((a, b) => +b.startedAt - +a.startedAt)[0];
      return { ...s, scanning: scanning.get(s.id) ?? false, nextCheckAt: d.ok ? null : d.retryAt.toISOString(), lastStatus: last?.status ?? null, lastMessage: last?.message ?? null };
    });
    res.json({ ...mine, private: priv, limit: MAX_PRIVATE_SOURCES });
  });
  api.post("/my/sources", user, async (req, res) => {
    const body = mySourceCreateSchema.parse(req.body);
    if (!body.urls.website && !body.urls.facebook && !body.urls.instagram && !body.urls.rss) {
      throw new HttpError(400, "VALIDATION_ERROR", "Agrega al menos un enlace (sitio, Facebook, Instagram o RSS)");
    }
    const row = await createPrivateSource(db, req.user!.id, slugify(body.name) || "fuente", body);
    if (row === "limit") throw new HttpError(409, "LIMIT", `Máximo ${MAX_PRIVATE_SOURCES} fuentes propias`);
    if (row === "exists") throw new HttpError(409, "CONFLICT", "Ya tienes una fuente con ese nombre");
    res.status(201).json(rowToSource(row));
  });
  api.patch("/my/sources/:id", user, async (req, res) => {
    const row = await patchPrivateSource(db, req.user!.id, p(req.params.id), mySourcePatchSchema.parse(req.body));
    if (!row) throw notFound("Fuente");
    res.json(rowToSource(row));
  });
  api.delete("/my/sources/:id", user, async (req, res) => {
    if (!(await deletePrivateSource(db, req.user!.id, p(req.params.id)))) throw notFound("Fuente");
    res.status(204).end();
  });
  api.post("/my/sources/:id/check", user, async (req, res) => {
    const s = await getOwnedSource(db, req.user!.id, p(req.params.id));
    if (!s) throw notFound("Fuente");
    const now = (deps.now ?? (() => new Date()))();
    if (isScanning(s, now)) throw new HttpError(409, "SCANNING", "Esta fuente se está revisando ahora mismo.");
    // Cortesía con los sitios: una revisión por fuente al día (+1 reintento si la anterior falló).
    const recent = await db.select({ startedAt: sourceChecks.startedAt, status: sourceChecks.status }).from(sourceChecks)
      .where(and(eq(sourceChecks.sourceId, s.id), gte(sourceChecks.startedAt, new Date(now.getTime() - 48 * 3_600_000))));
    const d = checkDecision(recent, now);
    if (!d.ok) throw new HttpError(429, "RATE_LIMITED", `${d.reason} Próxima revisión posible: ${d.retryAt.toISOString()}`);
    const r = await checkOne(deps, s, undefined, { trigger: "manual" });
    res.status(201).json({ ...r.check, newEvents: r.newEvents });
  });

  /* ---------- horario personal de revisión y avisos ---------- */
  api.get("/my/schedule", user, async (req, res) => res.json(await getSchedule(db, req.user!.id)));
  api.put("/my/schedule", user, async (req, res) => {
    res.json(await setSchedule(db, req.user!.id, scheduleSchema.parse(req.body)));
  });
  api.get("/my/notifications", user, async (req, res) => {
    const [items, unread] = await Promise.all([listNotifications(db, req.user!.id), unreadCount(db, req.user!.id)]);
    res.json({ items, unread });
  });
  api.get("/my/notifications/unread-count", user, async (req, res) => res.json({ unread: await unreadCount(db, req.user!.id) }));
  api.post("/my/notifications/read", user, async (req, res) => {
    await markAllRead(db, req.user!.id);
    res.status(204).end();
  });

  api.put("/my/subscriptions/:sourceId", user, async (req, res) => {
    if (!(await setSubscription(db, req.user!.id, p(req.params.sourceId), subscriptionSchema.parse(req.body ?? {})))) throw notFound("Fuente del catálogo");
    res.status(204).end();
  });
  api.delete("/my/subscriptions/:sourceId", user, async (req, res) => {
    if (!(await removeSubscription(db, req.user!.id, p(req.params.sourceId)))) throw notFound("Suscripción");
    res.status(204).end();
  });

  /* ---------- corridas ---------- */
  api.get("/discovery-runs", editor, async (req, res) => {
    const { page, pageSize } = paginationSchema.parse(req.query);
    res.json(await listRuns(db, page, pageSize));
  });
  api.post("/discovery-runs", editor, async (req, res) => {
    const { sourceIds } = runCreateSchema.parse(req.body ?? {});
    res.status(201).json(await runDiscovery(deps, "MANUAL", { sourceIds, startedBy: req.user?.id }));
  });

  /* ---------- usuarios ---------- */
  // Lo llama solo la web (token de servicio) tras un login OAuth exitoso.
  api.post("/internal/users/sync", requireService, async (req, res) => {
    const body = userSyncSchema.parse(req.body);
    if (body.provider === "dev" && !allowDevAuth) throw new HttpError(403, "FORBIDDEN", "Login de desarrollo deshabilitado");
    const u = await syncUser(db, body, adminEmails);
    res.json({ id: u.id, role: u.role, name: u.name, email: u.email, image: u.image });
  });
  api.get("/me", user, async (req, res) => {
    const u = await getUser(db, req.user!.id);
    if (!u) throw notFound("Usuario");
    res.json({ id: u.id, role: u.role, name: u.name, email: u.email, image: u.image, country: u.country });
  });
  api.get("/users", admin, async (req, res) => {
    const { page, pageSize } = paginationSchema.parse(req.query);
    const r = await listUsers(db, page, pageSize);
    res.json({ ...r, items: r.items.map(({ id, name, email, role, createdAt }) => ({ id, name, email, role, createdAt })) });
  });
  api.patch("/users/:id", admin, async (req, res) => {
    const r = await setRole(db, p(req.params.id), userRolePatchSchema.parse(req.body).role);
    if (r === "not-found") throw notFound("Usuario");
    if (r === "last-admin") throw new HttpError(409, "LAST_ADMIN", "Debe existir al menos un ADMIN");
    res.json({ id: r.id, role: r.role });
  });
  api.get("/saved-filters", user, async (req, res) => res.json({ items: await listSavedFilters(db, req.user!.id) }));
  api.post("/saved-filters", user, async (req, res) => {
    const { name, query } = savedFilterCreateSchema.parse(req.body);
    res.status(201).json(await createSavedFilter(db, req.user!.id, name, query));
  });
  api.delete("/saved-filters/:id", user, async (req, res) => {
    if (!(await deleteSavedFilter(db, req.user!.id, p(req.params.id)))) throw notFound("Filtro");
    res.status(204).end();
  });

  /* ---------- cron: el planificador (Vercel Cron / GitHub Actions / proceso propio) llama por GET cada hora ---------- */
  // `Authorization: Bearer $CRON_SECRET`. Idempotente: decide qué toca según los horarios y la política de cortesía.
  api.get("/cron/discovery", async (req, res) => {
    const secret = process.env.CRON_SECRET;
    const given = req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (!secret || !given || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
      throw new HttpError(401, "UNAUTHENTICATED", "Cron no autorizado");
    }
    res.json(await runScheduledTick(deps, { budgetMs: Number(process.env.CRON_BUDGET_MS ?? 45_000) }));
  });

  /* ---------- registro y acceso con usuario y contraseña (solo la web, con token de servicio) ---------- */
  api.post("/internal/auth/register", requireService, async (req, res) => {
    const b = registerSchema.parse(req.body);
    const r = await registerPasswordUser(db, b);
    if (r === "exists") throw new HttpError(409, "EXISTS", "Ya existe una cuenta con ese correo.");
    if ("problems" in r) throw new HttpError(422, "WEAK_PASSWORD", r.problems.join(" "));
    res.status(201).json({ id: r.id, role: r.role, name: r.name, email: r.email });
  });
  api.post("/internal/auth/verify", requireService, async (req, res) => {
    const b = loginSchema.parse(req.body);
    const r = await verifyLogin(db, b.email, b.password);
    if (r === "invalid") throw new HttpError(401, "INVALID_CREDENTIALS", "Correo o contraseña incorrectos.");
    if ("locked" in r) throw new HttpError(429, "LOCKED", "Demasiados intentos. Vuelve a intentarlo en unos minutos.");
    res.json({ id: r.id, role: r.role, name: r.name, email: r.email, image: r.image });
  });

  registerMetaCallbacks(api, { db });

  /* ---------- favoritos ---------- */
  api.get("/favorites", user, async (req, res) => {
    const { page, pageSize } = favoriteListQuerySchema.parse(req.query);
    res.json(await listFavorites(db, req.user!.id, page, pageSize));
  });
  api.post("/favorites/:eventId", user, async (req, res) => {
    if (!(await addFavorite(db, req.user!.id, p(req.params.eventId)))) throw notFound("Evento");
    res.status(204).end();
  });
  api.delete("/favorites/:eventId", user, async (req, res) => {
    await removeFavorite(db, req.user!.id, p(req.params.eventId));
    res.status(204).end();
  });

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/api", api);
  app.use(notFoundHandler);
  app.use(errorHandler(log));
  return app;
}
