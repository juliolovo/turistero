import type { CategoryId } from "@turistero/types";

export interface CategoryDef {
  id: CategoryId;
  emoji: string;
  label: string;
  /** etiqueta corta para chips */
  short: string;
  /** tono CSS (hue) para tintes por categoría */
  hue: number;
}

/** Emoji fijo por categoría: se antepone al título del evento. */
export const CATEGORIES: readonly CategoryDef[] = [
  { id: "rock", emoji: "🎸", label: "Rock / Metal", short: "Rock", hue: 355 },
  { id: "music", emoji: "🎵", label: "Conciertos / Música en vivo", short: "Música", hue: 285 },
  { id: "dance", emoji: "💃", label: "Salsa / Bachata / Baile", short: "Baile", hue: 38 },
  { id: "theater", emoji: "🎭", label: "Teatro / Comedia", short: "Teatro", hue: 320 },
  { id: "cinema", emoji: "🎬", label: "Cine", short: "Cine", hue: 225 },
  { id: "tech", emoji: "💻", label: "Tecnología", short: "Tech", hue: 200 },
  { id: "art", emoji: "🖼️", label: "Arte / Exposiciones", short: "Arte", hue: 165 },
  { id: "food", emoji: "🍽️", label: "Gastronomía", short: "Comida", hue: 22 },
  { id: "tours", emoji: "🌋", label: "Turismo / Tours / Excursiones", short: "Tours", hue: 140 },
  { id: "party", emoji: "🎉", label: "Fiestas / Actividades sociales", short: "Fiestas", hue: 340 },
];

export const FREE_EMOJI = "🆓";
export const NEW_EMOJI = "🆕";

const byId = new Map(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: CategoryId): CategoryDef {
  const c = byId.get(id);
  if (!c) throw new Error(`Unknown category: ${id}`);
  return c;
}

export function isCategoryId(v: string | undefined): v is CategoryId {
  return !!v && byId.has(v as CategoryId);
}

/** Días durante los cuales un evento recién descubierto lleva 🆕. */
export const NEW_WINDOW_DAYS = 3;

export function isNew(discoveredAt: string, now: Date = new Date()): boolean {
  const age = now.getTime() - new Date(discoveredAt).getTime();
  return age >= 0 && age <= NEW_WINDOW_DAYS * 86_400_000;
}

/** `[🆕] [🆓] {emoji} {title}` — se compone al mostrar, no se guarda. */
export function displayTitle(
  e: { title: string; category: CategoryId; discoveredAt: string; price: { isFree: boolean } },
  now: Date = new Date(),
): string {
  const parts: string[] = [];
  if (isNew(e.discoveredAt, now)) parts.push(NEW_EMOJI);
  if (e.price.isFree) parts.push(FREE_EMOJI);
  parts.push(getCategory(e.category).emoji, e.title);
  return parts.join(" ");
}
