import { z } from "zod";
import { CATEGORIES } from "@turistero/config";

const categoryIds = CATEGORIES.map((c) => c.id) as [string, ...string[]];

export const categorySchema = z.enum(categoryIds);
export const confidenceSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);
export const eventStatusSchema = z.enum(["PUBLISHED", "PENDING", "HIDDEN"]);
export const sourceTypeSchema = z.enum(["venue", "organizer", "tour-operator", "cultural", "mall", "institution", "media"]);
export const checkStatusSchema = z.enum(["SUCCESS", "NO_EVENTS", "ACCESS_RESTRICTED", "ERROR", "RATE_LIMITED", "AUTH_REQUIRED", "NOT_FOUND", "NO_RECENT_CONTENT"]);
export const roleSchema = z.enum(["USER", "EDITOR", "ADMIN"]);

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato yyyy-mm-dd");
const httpUrl = z.url({ protocol: /^https?$/ });

/* ---------- paginación ---------- */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type Pagination = z.infer<typeof paginationSchema>;

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/* ---------- eventos ---------- */
export const eventQuerySchema = paginationSchema.extend({
  country: z.string().length(2).toUpperCase().optional(),
  city: z.string().min(1).max(60).optional(),
  category: categorySchema.optional(),
  range: z.enum(["today", "tomorrow", "weekend", "week", "custom"]).default("week"),
  from: ymd.optional(),
  to: ymd.optional(),
  price: z.enum(["all", "free", "paid"]).default("all"),
  sort: z.enum(["date", "new", "relevance"]).default("date"),
  q: z.string().trim().max(100).optional(),
  status: eventStatusSchema.optional(), // solo EDITOR/ADMIN
  confidence: confidenceSchema.optional(), // solo EDITOR/ADMIN
});
export type EventQueryInput = z.infer<typeof eventQuerySchema>;

export const eventPatchSchema = z
  .object({
    title: z.string().min(2).max(200),
    description: z.string().max(5000),
    category: categorySchema,
    venue: z.string().min(1).max(200),
    address: z.string().max(300).nullable(),
    status: eventStatusSchema,
    confidence: confidenceSchema,
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime().nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Sin cambios");

/* ---------- fuentes / sources.json ---------- */
const urlOrNull = httpUrl.nullable();

export const sourceUrlsSchema = z.object({
  website: urlOrNull.default(null),
  facebook: urlOrNull.default(null),
  instagram: urlOrNull.default(null),
  tiktok: urlOrNull.default(null),
  rss: urlOrNull.optional(),
});

export const verificationSchema = z.enum(["verified", "unverified"]);

/**
 * Una fuente del catálogo. Configuración pública: NUNCA incluir secretos ni tokens.
 * `verification` indica si el vínculo entre las URLs y la entidad real fue comprobado.
 */
export const sourceSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug en minúsculas con guiones"),
  name: z.string().min(1).max(120),
  aliases: z.array(z.string().min(1).max(120)).default([]),
  type: sourceTypeSchema,
  country: z.string().length(2).default("NI"),
  city: z.string().min(1).max(60).nullable().default(null),
  categories: z.array(z.string().min(1)).default([]),
  active: z.boolean().default(true),
  priority: z.number().int().min(0).max(100).default(10),
  urls: sourceUrlsSchema.default({ website: null, facebook: null, instagram: null, tiktok: null }),
  verification: z
    .object({ facebook: verificationSchema.optional(), instagram: verificationSchema.optional(), website: verificationSchema.optional() })
    .default({}),
  lastReviewedAt: z.iso.datetime().nullable().default(null),
  notes: z.string().max(2000).default(""),
});
export type SourceInput = z.infer<typeof sourceSchema>;

export const sourceCreateSchema = sourceSchema.omit({ lastReviewedAt: true });
/** Sin defaults: un PATCH solo toca los campos enviados (los defaults de sourceSchema pisarían datos existentes). */
export const sourcePatchSchema = z
  .object({
    name: z.string().min(1).max(120),
    aliases: z.array(z.string().min(1).max(120)),
    type: sourceTypeSchema,
    country: z.string().length(2),
    city: z.string().min(1).max(60).nullable(),
    categories: z.array(z.string().min(1)),
    active: z.boolean(),
    priority: z.number().int().min(0).max(100),
    urls: z.object({ website: urlOrNull, facebook: urlOrNull, instagram: urlOrNull, tiktok: urlOrNull, rss: urlOrNull.optional() }),
    verification: z.object({ facebook: verificationSchema, instagram: verificationSchema, website: verificationSchema }).partial(),
    notes: z.string().max(2000),
  })
  .partial();

export const sourcesFileSchema = z.object({
  version: z.literal(1),
  sources: z.array(sourceSchema),
});
export type SourcesFile = z.infer<typeof sourcesFileSchema>;

export const sourceListQuerySchema = paginationSchema.extend({
  city: z.string().optional(),
  active: z.enum(["true", "false"]).optional(),
  q: z.string().trim().max(100).optional(),
});

export const importSourcesSchema = z.object({
  mode: z.enum(["merge", "replace-matching"]).default("merge"),
  file: sourcesFileSchema,
});

/* ---------- candidatos ---------- */
export const candidateCreateSchema = z.object({
  name: z.string().min(1).max(120),
  city: z.string().max(60).nullable().default(null),
  category: z.string().max(60).nullable().default(null),
  discoveredFrom: z.string().max(300).nullable().default(null),
  urls: sourceUrlsSchema.default({ website: null, facebook: null, instagram: null, tiktok: null }),
  confidence: confidenceSchema.default("LOW"),
});
export const candidateActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), source: sourceCreateSchema.partial({ id: true }).optional() }),
  z.object({ action: z.literal("reject") }),
  z.object({ action: z.literal("merge"), intoSourceId: z.string() }),
]);

/* ---------- corridas ---------- */
export const runCreateSchema = z.object({
  sourceIds: z.array(z.string()).max(200).optional(),
});

/* ---------- favoritos ---------- */
export const favoriteListQuerySchema = paginationSchema;

/* ---------- usuarios ---------- */
export const userSyncSchema = z.object({
  provider: z.enum(["google", "facebook", "dev"]),
  providerAccountId: z.string().min(1).max(200),
  email: z.email().nullish(),
  emailVerified: z.boolean().default(false),
  name: z.string().max(200).nullish(),
  image: z.url().max(1000).nullish(),
});
export const userRolePatchSchema = z.object({ role: roleSchema });
export const savedFilterCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  query: z.record(z.string().max(40), z.string().max(200)).refine((q) => Object.keys(q).length <= 12, "Demasiados parámetros"),
});

/* ---------- alta manual y conexiones ---------- */
export const eventFromSchema = z
  .object({
    url: httpUrl.optional(),
    text: z.string().trim().min(10).max(8000).optional(),
    organizer: z.string().trim().max(120).optional(),
    city: z.string().trim().max(60).optional(),
    publish: z.boolean().default(false),
  })
  .refine((v) => !!v.url !== !!v.text, "Envía `url` o `text` (solo uno)");

export const connectionCreateSchema = z.object({
  provider: z.enum(["facebook", "instagram"]),
  externalId: z.string().trim().min(1).max(100),
  token: z.string().trim().min(10).max(4000),
  label: z.string().trim().max(100).optional(),
  scope: z.string().max(500).optional(),
  expiresAt: z.iso.datetime().nullish(),
});
