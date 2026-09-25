import { fold } from "./text";

export interface ParsedPrice {
  isFree: boolean;
  currency?: "NIO" | "USD" | "EUR";
  min?: number;
  max?: number;
  /** Se encontró una señal de precio pero no un monto claro. */
  note?: string;
}

const FREE = /\b(entrada\s+libre|entrada\s+gratis|entrada\s+gratuita|gratis|gratuito|gratuita|free\s+entry|free|sin\s+costo|sin\s+cover|cover\s+free|libre\s+de\s+costo)\b/;

/**
 * Interpreta precios en publicaciones nicaragüenses:
 *  - "C$200", "C$ 200", "córdobas", "NIO" -> NIO
 *  - "US$35", "$35", "USD 35", "dólares" -> USD  ("$" solo se considera dólar si no va precedido de "C")
 * Devuelve null si el texto no menciona precio.
 */
export function parsePrice(text: string): ParsedPrice | null {
  const t = fold(text).replace(/\s+/g, " ");
  const amounts: { v: number; cur: "NIO" | "USD" | "EUR" }[] = [];
  const num = "(\\d{1,3}(?:[.,]\\d{3})+|\\d+(?:[.,]\\d{1,2})?)";
  const parseNum = (s: string) => {
    if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return +s.replace(/[.,]/g, "");
    return +s.replace(",", ".");
  };
  let m: RegExpExecArray | null;

  const nio = new RegExp(`(?:\\bc\\$|\\bc\\s?\\$|\\bnio\\b|c[oó]rdobas?)\\s*${num}|${num}\\s*(?:c[oó]rdobas?|\\bnio\\b)`, "g");
  while ((m = nio.exec(t))) amounts.push({ v: parseNum(m[1] ?? m[2]!), cur: "NIO" });
  const usd = new RegExp(`(?:\\bus\\s?\\$|\\busd\\b|(?<![a-z])\\$)\\s*${num}|${num}\\s*(?:usd|d[oó]lares|dolares|\\bus\\b)`, "g");
  while ((m = usd.exec(t))) amounts.push({ v: parseNum(m[1] ?? m[2]!), cur: "USD" });
  const eur = new RegExp(`(?:€|\\beur\\b)\\s*${num}|${num}\\s*(?:€|euros?)`, "g");
  while ((m = eur.exec(t))) amounts.push({ v: parseNum(m[1] ?? m[2]!), cur: "EUR" });

  const valid = amounts.filter((a) => a.v > 0 && a.v < 1_000_000);
  if (valid.length) {
    // Con varias monedas gana la primera mencionada.
    const cur = valid[0]!.cur;
    const vals = valid.filter((a) => a.cur === cur).map((a) => a.v);
    return { isFree: false, currency: cur, min: Math.min(...vals), max: Math.max(...vals) };
  }
  if (FREE.test(t) && !/no\s+(?:es\s+)?(?:gratis|gratuito)/.test(t)) return { isFree: true };
  if (/\b(precio|costo|entrada|cover|boleto|ticket|inversion)\b/.test(t)) return { isFree: false, note: "Precio por confirmar" };
  return null;
}
