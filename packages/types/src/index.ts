export type CategoryId =
  | "rock"
  | "music"
  | "dance"
  | "theater"
  | "cinema"
  | "tech"
  | "art"
  | "food"
  | "tours"
  | "party";

export type Confidence = "HIGH" | "MEDIUM" | "LOW";
export type EventStatus = "PUBLISHED" | "PENDING" | "HIDDEN";
export type SourceType =
  | "venue"
  | "organizer"
  | "tour-operator"
  | "cultural"
  | "mall"
  | "institution"
  | "media";
export type SourcePlatform = "facebook" | "instagram" | "website" | "tiktok" | "rss" | "manual";

/** EVENT_SOURCE_URL apunta a la publicación concreta; PROFILE_URL solo al perfil. Nunca se sustituyen entre sí. */
export type UrlKind = "EVENT_SOURCE_URL" | "PROFILE_URL";

export interface EventImage {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
  source?: string;
}

export interface EventSourceRef {
  sourceId: string;
  sourceName: string;
  platform: SourcePlatform;
  urlKind: UrlKind;
  /** Publicación concreta. null => "Sin enlace directo". */
  originalPostUrl: string | null;
  profileUrl: string | null;
}

export interface Place {
  /** slug de ciudad, p. ej. "managua" */
  id: string;
  name: string;
  country: string; // ISO-3166-1 alpha-2
  timezone: string; // IANA
  lat?: number;
  lng?: number;
}

export interface EventItem {
  id: string;
  slug: string;
  /** Título limpio, sin emojis: se compone con displayTitle(). */
  title: string;
  description: string;
  category: CategoryId;
  startsAt: string; // ISO UTC
  endsAt?: string;
  timezone: string;
  venue: string;
  placeId: string;
  country: string;
  address?: string;
  lat?: number;
  lng?: number;
  organizer?: { name: string; profileUrl?: string };
  price: { isFree: boolean; currency?: string; min?: number; max?: number; note?: string };
  image?: EventImage;
  confidence: Confidence;
  status: EventStatus;
  discoveredAt: string;
  lastVerifiedAt: string;
  sources: EventSourceRef[];
  /** true => dato de ejemplo, nunca información real. */
  isMock: boolean;
}

export type DateRangeKey = "today" | "tomorrow" | "weekend" | "week" | "custom";
export type PriceFilter = "all" | "free" | "paid";
export type SortKey = "date" | "new" | "relevance";
export type ViewMode = "cards" | "list";

export interface EventQuery {
  placeId?: string;
  country?: string;
  category?: CategoryId;
  range?: DateRangeKey;
  from?: string; // yyyy-mm-dd
  to?: string;
  price?: PriceFilter;
  sort?: SortKey;
  q?: string;
  /** Agenda personal (fuentes propias + suscritas). Requiere sesión. */
  mine?: boolean;
  limit?: number;
  /** Paginación (1-based). */
  page?: number;
  pageSize?: number;
}
