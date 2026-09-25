import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMockEvents } from "@turistero/mocks";
import { sourcesFileSchema } from "@turistero/schemas";
import type { Db } from "./client";
import { eventSources, events } from "./schema";
import { importSources } from "./sources";

const here = path.dirname(fileURLToPath(import.meta.url));
export const SOURCES_JSON = path.resolve(here, "../../../config/sources.json");

export async function seedSources(db: Db, file = SOURCES_JSON) {
  const parsed = sourcesFileSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  return importSources(db, parsed, "merge");
}

/** Inserta los eventos de EJEMPLO (is_mock = true). Nunca usar en producción real. */
export async function seedMockEvents(db: Db, now = new Date()) {
  const items = buildMockEvents(now);
  for (const e of items) {
    await db
      .insert(events)
      .values({
        id: e.id, slug: e.slug, title: e.title, description: e.description, category: e.category,
        startsAt: new Date(e.startsAt), timezone: e.timezone, venueName: e.venue, placeId: e.placeId, country: e.country,
        organizerName: e.organizer?.name ?? null, organizerUrl: e.organizer?.profileUrl ?? null,
        isFree: e.price.isFree, currency: e.price.currency ?? null, priceMin: e.price.min ?? null, priceMax: e.price.max ?? null,
        confidence: e.confidence, status: e.status, isMock: true,
        discoveredAt: new Date(e.discoveredAt), lastVerifiedAt: new Date(e.lastVerifiedAt),
      })
      .onConflictDoNothing();
    await db
      .insert(eventSources)
      .values(e.sources.map((s) => ({ eventId: e.id, sourceId: s.sourceId, sourceName: s.sourceName, platform: s.platform, urlKind: s.urlKind, originalPostUrl: s.originalPostUrl, profileUrl: s.profileUrl })))
      .onConflictDoNothing();
  }
  return items.length;
}
