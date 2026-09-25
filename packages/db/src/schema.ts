import { boolean, doublePrecision, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const roleEnum = pgEnum("role", ["USER", "EDITOR", "ADMIN"]);
export const confidenceEnum = pgEnum("confidence", ["HIGH", "MEDIUM", "LOW"]);
export const eventStatusEnum = pgEnum("event_status", ["PUBLISHED", "PENDING", "HIDDEN"]);
export const sourceTypeEnum = pgEnum("source_type", ["venue", "organizer", "tour-operator", "cultural", "mall", "institution", "media"]);
export const checkStatusEnum = pgEnum("check_status", ["SUCCESS", "NO_EVENTS", "ACCESS_RESTRICTED", "ERROR", "RATE_LIMITED", "AUTH_REQUIRED", "NOT_FOUND", "NO_RECENT_CONTENT"]);
export const runStatusEnum = pgEnum("run_status", ["RUNNING", "COMPLETED", "PARTIAL", "FAILED"]);
export const runTriggerEnum = pgEnum("run_trigger", ["CRON", "MANUAL"]);
export const candidateStatusEnum = pgEnum("candidate_status", ["PENDING", "APPROVED", "REJECTED", "MERGED"]);
export const urlKindEnum = pgEnum("url_kind", ["EVENT_SOURCE_URL", "PROFILE_URL"]);
export const platformEnum = pgEnum("platform", ["facebook", "instagram", "website", "tiktok", "rss", "manual"]);

/* ---------- usuarios (forma compatible con Auth.js; Fase 3 añade verificationToken si hace falta) ---------- */
export const users = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: ts("email_verified"),
  image: text("image"),
  role: roleEnum("role").notNull().default("USER"),
  country: text("country").notNull().default("NI"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    // Tokens OAuth: en Fase 3 se guardan CIFRADOS (AES-GCM con TOKEN_ENCRYPTION_KEY), nunca en claro.
    refreshToken: text("refresh_token"),
    accessToken: text("access_token"),
    expiresAt: integer("expires_at"),
    scope: text("scope"),
    idToken: text("id_token"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("session", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: ts("expires").notNull(),
});

/* ---------- fuentes ---------- */
export const sources = pgTable(
  "source",
  {
    id: text("id").primaryKey(), // slug
    name: text("name").notNull(),
    aliases: text("aliases").array().notNull().default([]),
    type: sourceTypeEnum("type").notNull(),
    country: text("country").notNull().default("NI"),
    city: text("city"),
    categories: text("categories").array().notNull().default([]),
    active: boolean("active").notNull().default(true),
    priority: integer("priority").notNull().default(10),
    urls: jsonb("urls").$type<{ website: string | null; facebook: string | null; instagram: string | null; tiktok: string | null; rss?: string | null }>().notNull(),
    verification: jsonb("verification").$type<Record<string, "verified" | "unverified">>().notNull().default({}),
    /** null => fuente del catálogo global; con valor => fuente privada de ese usuario. */
    ownerId: text("owner_id").references(() => users.id, { onDelete: "cascade" }),
    lastReviewedAt: ts("last_reviewed_at"),
    notes: text("notes").notNull().default(""),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("source_city_idx").on(t.city), index("source_active_idx").on(t.active)],
);

/** Vínculo verificado entre una fuente y una cuenta concreta (FB/IG/web). Nunca se infiere por parecido de nombre. */
export const sourceAccounts = pgTable(
  "source_account",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    externalId: text("external_id"),
    profileUrl: text("profile_url").notNull(),
    verified: boolean("verified").notNull().default(false),
    verifiedBy: text("verified_by"),
    verifiedAt: ts("verified_at"),
  },
  (t) => [uniqueIndex("source_account_unique").on(t.sourceId, t.platform)],
);

/** Lista personal: qué fuentes revisa cada usuario. */
export const userSources = pgTable(
  "user_source",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    sourceId: text("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
    alias: text("alias"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.sourceId] })],
);

export const sourceCandidates = pgTable("source_candidate", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city"),
  category: text("category"),
  discoveredFrom: text("discovered_from"),
  urls: jsonb("urls").$type<{ website: string | null; facebook: string | null; instagram: string | null; tiktok: string | null; rss?: string | null }>().notNull(),
  confidence: confidenceEnum("confidence").notNull().default("LOW"),
  status: candidateStatusEnum("status").notNull().default("PENDING"),
  mergedIntoId: text("merged_into_id").references(() => sources.id, { onDelete: "set null" }),
  discoveredAt: ts("discovered_at").notNull().defaultNow(),
  reviewedBy: text("reviewed_by"),
});

/* ---------- corridas y auditoría ---------- */
export const discoveryRuns = pgTable("discovery_run", {
  id: text("id").primaryKey(),
  trigger: runTriggerEnum("trigger").notNull(),
  startedAt: ts("started_at").notNull().defaultNow(),
  completedAt: ts("completed_at"),
  sourcesChecked: integer("sources_checked").notNull().default(0),
  eventsFound: integer("events_found").notNull().default(0),
  newEvents: integer("new_events").notNull().default(0),
  errors: integer("errors").notNull().default(0),
  status: runStatusEnum("status").notNull().default("RUNNING"),
  startedBy: text("started_by"),
});

export const sourceChecks = pgTable(
  "source_check",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
    runId: text("run_id").references(() => discoveryRuns.id, { onDelete: "set null" }),
    startedAt: ts("started_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
    status: checkStatusEnum("status").notNull(),
    postsReviewed: integer("posts_reviewed").notNull().default(0),
    eventsFound: integer("events_found").notNull().default(0),
    message: text("message").notNull().default(""),
  },
  (t) => [index("source_check_source_idx").on(t.sourceId, t.startedAt)],
);

/* ---------- eventos ---------- */
export const venues = pgTable("venue", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city"),
  country: text("country").notNull().default("NI"),
  address: text("address"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
});

export const organizers = pgTable("organizer", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  profileUrl: text("profile_url"),
});

export const events = pgTable(
  "event",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(), // limpio, sin emojis
    description: text("description").notNull().default(""),
    category: text("category").notNull(), // ids de @turistero/config (fuente de verdad de emoji/label)
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at"),
    timezone: text("timezone").notNull(),
    venueId: text("venue_id").references(() => venues.id, { onDelete: "set null" }),
    venueName: text("venue_name").notNull(),
    organizerId: text("organizer_id").references(() => organizers.id, { onDelete: "set null" }),
    organizerName: text("organizer_name"),
    organizerUrl: text("organizer_url"),
    placeId: text("place_id").notNull(),
    country: text("country").notNull().default("NI"),
    address: text("address"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    isFree: boolean("is_free").notNull().default(false),
    currency: text("currency"),
    priceMin: doublePrecision("price_min"),
    priceMax: doublePrecision("price_max"),
    priceNote: text("price_note"),
    image: jsonb("image").$type<{ url: string; width?: number; height?: number; alt?: string; source?: string }>(),
    confidence: confidenceEnum("confidence").notNull(),
    status: eventStatusEnum("status").notNull().default("PENDING"),
    isMock: boolean("is_mock").notNull().default(false),
    dedupeKey: text("dedupe_key"),
    discoveredAt: ts("discovered_at").notNull().defaultNow(),
    lastVerifiedAt: ts("last_verified_at").notNull().defaultNow(),
  },
  (t) => [index("event_starts_idx").on(t.startsAt), index("event_place_idx").on(t.placeId), index("event_dedupe_idx").on(t.dedupeKey)],
);

/** Un evento puede tener varias fuentes. `originalPostUrl` nullable: nunca se rellena con la URL del perfil. */
export const eventSources = pgTable(
  "event_source",
  {
    eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    sourceId: text("source_id").notNull(), // sin FK: las fuentes de ejemplo pueden no existir en el catálogo
    sourceName: text("source_name").notNull(),
    platform: platformEnum("platform").notNull(),
    urlKind: urlKindEnum("url_kind").notNull(),
    originalPostUrl: text("original_post_url"),
    profileUrl: text("profile_url"),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.sourceId, t.platform] })],
);

export const favorites = pgTable(
  "favorite",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.eventId] })],
);

/** Filtros de búsqueda guardados por el usuario (query = parámetros de /api/events). */
export const savedFilters = pgTable(
  "saved_filter",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    query: jsonb("query").$type<Record<string, string>>().notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("saved_filter_user_idx").on(t.userId)],
);

/**
 * Conexiones a APIs externas (Meta). El token se guarda CIFRADO (AES-256-GCM, ver crypto.ts); nunca en claro
 * ni en sources.json. `externalId`: id de la Página de Facebook o del usuario IG profesional que usa Business Discovery.
 */
export const connections = pgTable(
  "connection",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // "facebook" | "instagram"
    externalId: text("external_id").notNull(),
    label: text("label"),
    tokenEnc: text("token_enc").notNull(),
    scope: text("scope"),
    expiresAt: ts("expires_at"),
    lastError: text("last_error"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("connection_unique").on(t.userId, t.provider, t.externalId)],
);
