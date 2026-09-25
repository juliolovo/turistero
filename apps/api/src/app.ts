import { timingSafeEqual } from "node:crypto";
import express, { Router } from "express";
import cors from "cors";
import { z } from "zod";
import { slugify } from "@turistero/event-parser";
import helmet from "helmet";
import { pino, type Logger } from "pino";
import { pinoHttp } from "pino-http";
import type { Db } from "@turistero/db";
import {
  deleteConnection, listConnections, saveConnection, actOnCandidate, addFavorite, createSavedFilter, deleteSavedFilter, getUser, listSavedFilters, listUsers, setRole, syncUser, createCandidate, createSource, deleteSource, exportSources, getEvent, getSourceRow, importSources,
  failureStreaks, latestChecks, mergeEvents, listCandidates, listChecks, listEvents, listFavorites, listRuns, listSources, patchSource, removeFavorite, rowToSource, updateEvent,
} from "@turistero/db";
import {
  candidateActionSchema, candidateCreateSchema, eventPatchSchema, eventQuerySchema, favoriteListQuerySchema, importSourcesSchema,
  paginationSchema, runCreateSchema, connectionCreateSchema, eventFromSchema, savedFilterCreateSchema, userRolePatchSchema, userSyncSchema, sourceCreateSchema, sourceListQuerySchema, sourcePatchSchema,
} from "@turistero/schemas";
import { CATEGORIES, COUNTRIES, PLACES, FREE_EMOJI, NEW_EMOJI } from "@turistero/config";
import { authenticate, requireRole, requireService } from "./auth";
import { checkOne, candidatesFromContents, persistCandidate, runDiscovery, type DiscoveryDeps } from "./discovery";
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
    res.json(await listEvents(db, q, { includeAll: staff }));
  });
  api.get("/events/:id", async (req, res) => {
    const e = await getEvent(db, p(req.params.id), { includeAll: isStaff(req.user?.role) });
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
  api.get("/sources/:id", async (req, res) => {
    const s = await getSourceRow(db, p(req.params.id));
    if (!s) throw notFound("Fuente");
    res.json(rowToSource(s));
  });
  api.patch("/sources/:id", editor, async (req, res) => {
    const s = await patchSource(db, p(req.params.id), sourcePatchSchema.parse(req.body));
    if (!s) throw notFound("Fuente");
    res.json(s);
  });
  api.delete("/sources/:id", admin, async (req, res) => {
    if (!(await deleteSource(db, p(req.params.id)))) throw notFound("Fuente");
    res.status(204).end();
  });
  api.post("/sources/:id/check", editor, async (req, res) => {
    const s = await getSourceRow(db, p(req.params.id));
    if (!s) throw notFound("Fuente");
    res.status(201).json((await checkOne(deps, s)).check);
  });
  api.get("/sources/:id/checks", editor, async (req, res) => {
    const { page, pageSize } = paginationSchema.parse(req.query);
    if (!(await getSourceRow(db, p(req.params.id)))) throw notFound("Fuente");
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

  /* ---------- cron (Vercel Cron llama por GET con `Authorization: Bearer $CRON_SECRET`) ---------- */
  api.get("/cron/discovery", async (req, res) => {
    const secret = process.env.CRON_SECRET;
    const given = req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (!secret || !given || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
      throw new HttpError(401, "UNAUTHENTICATED", "Cron no autorizado");
    }
    // Lunes, miércoles y viernes 05:15 America/Managua (11:15 UTC). Las ejecuciones extra continúan lo pendiente.
    const run = await runDiscovery(deps, "CRON", { skipCheckedWithinHours: 6, budgetMs: Number(process.env.CRON_BUDGET_MS ?? 45_000) });
    res.json(run);
  });

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
