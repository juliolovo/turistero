import type { SourceContent } from "@turistero/event-parser";
import type { SafeFetcher } from "./safe-fetch";

export type CheckStatus =
  | "SUCCESS"
  | "NO_EVENTS"
  | "ACCESS_RESTRICTED"
  | "ERROR"
  | "RATE_LIMITED"
  | "AUTH_REQUIRED"
  | "NOT_FOUND"
  | "NO_RECENT_CONTENT";

/** Fuente tal como la ven los adaptadores (subconjunto del catálogo). */
export interface DiscoverySource {
  id: string;
  name: string;
  type: string;
  city: string | null;
  urls: { website: string | null; facebook: string | null; instagram: string | null; tiktok: string | null; rss?: string | null };
  verification?: Record<string, "verified" | "unverified">;
}

export interface Credential {
  externalId: string;
  token: string;
}

export interface FetchOptions {
  now: Date;
  maxItems: number;
  fetcher: SafeFetcher;
  /** Credenciales de APIs oficiales (Meta). Sin ellas, Facebook/Instagram devuelven AUTH_REQUIRED. */
  credentials?: { facebook?: Credential; instagram?: Credential };
  graphVersion?: string;
}

export interface DiscoveredLink {
  platform: "facebook" | "instagram" | "website";
  url: string;
  handle?: string;
  context?: string;
}

/**
 * Resultado de revisar una fuente. Deliberadamente más rico que `SourceContent[]`: el estado
 * (RESTRICTED, RATE_LIMITED…) es lo que alimenta la auditoría de /admin/sources/status.
 */
export interface AdapterResult {
  status: CheckStatus;
  message: string;
  contents: SourceContent[];
  /** Nº de publicaciones/páginas realmente revisadas. */
  postsReviewed: number;
  discoveredLinks?: DiscoveredLink[];
}

export interface SourceAdapter {
  readonly id: string;
  canHandle(source: DiscoverySource): boolean;
  fetchRecentContent(source: DiscoverySource, options: FetchOptions): Promise<AdapterResult>;
}
