import type { EventItem } from "@turistero/types";

const SYMBOL: Record<string, string> = { NIO: "C$", USD: "US$", EUR: "€" };

export function formatPrice(p: EventItem["price"]): string {
  if (p.isFree) return "Gratis";
  if (p.min == null) return p.note ?? "Precio por confirmar";
  const s = SYMBOL[p.currency ?? ""] ?? p.currency ?? "";
  const one = `${s}${p.min}`;
  return p.max != null && p.max !== p.min ? `${one}–${s}${p.max}` : one;
}
